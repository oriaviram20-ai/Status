# Status

אתר אישי לניהול כסף וניהול החיים.

- כניסה עם חשבון Google בלבד.
- המידע נשמר ב־Firestore (מסד נתונים בענן של Google Firebase), תחת חוקי אבטחה שמאפשרים קריאה וכתיבה רק לבעל החשבון.
- הקוד כאן ציבורי, אבל אין בו שום מידע אישי. ההגדרות של Firebase שבקוד הן ציבוריות מטבען, וההגנה על המידע נעשית בחוקי האבטחה בצד של Firebase.
- הקוד מוכן להפוך בהמשך לאפליקציה לטלפון.

## חלוקת תפקידים

- **Claude** כותב ומתחזק את הקוד (כל הקבצים בריפו).
- **Instinct** מזין נתונים בלבד ולא משנה קוד, חוקי אבטחה או הגדרות:
  - קבצים גולמיים (פירוט אשראי, תלוש שכר, ייצוא Splitwise ב־CSV) לתיקייה `Status Inbox` בגוגל דרייב. האתר מייבא אותם לתנועות בסנכרון.
  - מסמכים (חשבונות, ביטוחים, הוצאות משותפות, מועדים) דרך אזור הקליטה הפרטי `document-intake.html`. כל מסמך מחכה לאישור של אור.
  - מה שהאתר עדיין צריך מופיע בגיליון `Status · משימות ל־Instinct`, בלשונית "משימות".
- **אור** מאשר מסמכים, ומסתכל על הניתוח באתר.

## Roles (for any assistant reading this)

Claude owns the code. Instinct only enters data: raw files into the Drive folder `Status Inbox`, structured documents through `document-intake.html` (staging, reviewed by the owner). Do not edit `index.html`, `merge.js`, `document-intake.*` or `firestore.rules`, and do not publish Firestore rules; ask the owner to route code changes to Claude.
