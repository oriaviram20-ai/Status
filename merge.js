/* mergeLib v4 - three-way conflict-safe state merge for the Status app and sync writers.
 *
 * The app stores its whole state in one Firestore document users/{uid}/data/state
 * and every writer saves the entire JSON. Without coordination a stale writer
 * (another tab, a device, a sync agent) silently overwrites newer changes.
 *
 * Design:
 *   v          - integer document version on the Firestore doc, incremented
 *                inside the write transaction; Firestore rules enforce
 *                request.v == resource.v + 1 (legacy docs without v migrate at
 *                v == 1), so stale whole-state writes are rejected at storage.
 *   baseV      - the v the writer loaded before editing; informational only.
 *   snapshot   - the cloud doc as this writer loaded it (localStorage lc-base).
 *                It is the COMMON BASE for a three-way merge: for every entry
 *                and field we can tell exactly who moved since load.
 *
 * Per entry (matched by id only; two identical transactions with different
 * ids are legit duplicates and both survive):
 *   in BOTH cloud and local:
 *     only local moved since snapshot  -> keep local's version
 *     only cloud moved since snapshot  -> keep cloud's version
 *     both moved to same content       -> keep one copy
 *     both moved, content differs      -> CONFLICT
 *   ONLY in cloud:
 *     in snapshot, unchanged since     -> local deleted it: honor the deletion
 *     in snapshot, cloud moved it      -> CONFLICT (local delete vs cloud edit;
 *                                         delete-vs-edit never resolves silently)
 *     not in snapshot                  -> added remotely after load: keep
 *   ONLY in local: symmetric (local edit vs cloud delete -> CONFLICT;
 *     local addition -> keep; untouched -> honor cloud deletion).
 *
 * No snapshot (first run after deploy, unsaved legacy local state): fall back
 * to conservative union - differing shared entries and fields CONFLICT,
 * one-sided entries are kept. A pre-deploy deletion can resurrect at most once
 * in this window (honest residual; NOT zero-cost), and only until the first
 * post-deploy load captures a snapshot.
 *
 * CONFLICT = the write is rejected with MergeConflict. The app keeps the
 * rejected state as a recoverable pending action (localStorage lc-pending),
 * adopts the cloud version, and offers explicit retry/reconciliation - the
 * user's unsaved action is never silently discarded.
 */
const mergeLib = (() => {
  class MergeConflict extends Error {
    constructor(detail) { super('merge-conflict: ' + detail); this.name = 'MergeConflict'; this.detail = detail; }
  }

  const idOf = e => e && e.id != null ? String(e.id) : null;
  const strip = e => { const c = Object.assign({}, e); delete c.cv; delete c.mv; return JSON.stringify(c); };
  const BOOKKEEPING = new Set(['updatedAt', 'deviceId', 'v', 'baseV']);
  const MERGED_ARRAYS = ['docs', 'tx', 'items', 'holdings', 'deadlines', 'savings', 'debts', 'fgoals', 'wb', 'challenges', 'snapshots', 'autoLog'];

  function mergeArray(cloudArr, localArr, snapArr) {
    const cArr = cloudArr || [], lArr = localArr || [], sArr = snapArr || null;
    const cById = new Map(), lById = new Map(), sById = new Map();
    cArr.forEach(e => { const k = idOf(e); if (k) cById.set(k, e); });
    lArr.forEach(e => { const k = idOf(e); if (k) lById.set(k, e); });
    if (sArr) sArr.forEach(e => { const k = idOf(e); if (k) sById.set(k, e); });
    const out = [], seen = new Set();

    for (const [k, ce] of cById) {
      const le = lById.get(k);
      if (le) {
        if (strip(le) === strip(ce)) { out.push(ce); }
        else {
          const se = sById.get(k);
          if (se) {
            const cMoved = strip(ce) !== strip(se), lMoved = strip(le) !== strip(se);
            if (cMoved && lMoved) throw new MergeConflict('entry ' + k + ' edited on both sides');
            out.push(lMoved ? le : ce);
          } else {
            throw new MergeConflict('entry ' + k + ' differs across writers and no common base exists');
          }
        }
      } else {
        // Only in cloud: remote addition, or a local deletion.
        const se = sById.get(k);
        if (!se) { out.push(ce); }                              // added after load (or no base): keep
        else if (strip(ce) !== strip(se)) {
          throw new MergeConflict('entry ' + k + ': deleted locally vs edited remotely');
        } // else: local deleted it and cloud never touched it -> honor the deletion
      }
      seen.add(k);
    }
    for (const [k, le] of lById) {
      if (seen.has(k)) continue;
      // Only in local: local addition, or a cloud deletion.
      const se = sById.get(k);
      if (!se) { out.push(le); continue; }                      // added after load (or no base): keep
      if (strip(le) !== strip(se)) {
        throw new MergeConflict('entry ' + k + ': edited locally vs deleted remotely');
      } // else: cloud deleted it and local never touched it -> honor the deletion
    }
    // Entries without ids: keep the content-union (no deletion inference possible).
    lArr.filter(e => !idOf(e)).forEach(e => out.push(e));
    cArr.filter(e => !idOf(e)).forEach(e => {
      if (!out.some(x => strip(x) === strip(e))) out.push(e);
    });
    return out;
  }

  function mergeState(cloud, local, snapshot) {
    const snap = snapshot || null;
    const out = Object.assign({}, cloud, local);
    for (const k of MERGED_ARRAYS) {
      if (cloud[k] !== undefined || local[k] !== undefined || (snap && snap[k] !== undefined)) {
        out[k] = mergeArray(cloud[k], local[k], snap && snap[k]);
      }
    }
    const keys = new Set([...Object.keys(cloud || {}), ...Object.keys(local || {})]);
    for (const k of keys) {
      if (BOOKKEEPING.has(k) || MERGED_ARRAYS.includes(k)) continue;
      const c = cloud[k], l = local[k];
      if (JSON.stringify(c) === JSON.stringify(l)) continue;
      const s = snap ? snap[k] : undefined;
      if (snap) {
        const cMoved = JSON.stringify(c) !== JSON.stringify(s);
        const lMoved = JSON.stringify(l) !== JSON.stringify(s);
        if (cMoved && lMoved) throw new MergeConflict('field "' + k + '" changed on both sides');
        if (lMoved) { if (l === undefined) delete out[k]; else out[k] = l; }
        else { if (c === undefined) delete out[k]; else out[k] = c; }
      } else {
        throw new MergeConflict('field "' + k + '" changed on both sides and no common base exists');
      }
    }
    out.autoLog = (out.autoLog || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .filter((e, i, arr) => arr.findIndex(x => x.ts === e.ts && x.t === e.t) === i).slice(0, 50);
    out.updatedAt = Math.max(cloud.updatedAt || 0, local.updatedAt || 0);
    // Informational: the merged writer provably saw both sides.
    out.baseV = Math.max(cloud.v || 0, cloud.baseV || 0, local.baseV || 0);
    return out;
  }

  // legacyPreview: entries a pre-versioned local draft would ADD to the adopted
  // cloud state (per top-level array), so the user sees the consequence of an
  // explicit legacy merge - including re-adding records deleted elsewhere.
  function legacyPreview(cloudState, draftState) {
    const key = e => (e && typeof e === 'object' && 'id' in e) ? 'i:' + e.id : 'j:' + JSON.stringify(e);
    const out = {};
    for (const k of Object.keys(draftState || {})) {
      const d = draftState[k], c = (cloudState || {})[k];
      if (!Array.isArray(d) || !Array.isArray(c)) continue;
      const have = new Set(c.map(key));
      const added = d.filter(e => !have.has(key(e)));
      if (added.length) out[k] = added.length;
    }
    return out;
  }

  return { mergeState, MergeConflict, legacyPreview };
})();
if (typeof window !== 'undefined') window.mergeLib = mergeLib;
if (typeof module !== 'undefined' && module.exports) module.exports = mergeLib;
