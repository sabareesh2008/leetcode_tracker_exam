FINAL CODING TEST DOM FIX

ROOT CAUSE FIXED:
script.js was loading BEFORE the Coding Test admin modal HTML.
Because of that:
- Close button had no click listener
- Add Question form had no submit listener
- Add Test Case form had no submit listener
- Step buttons did not work correctly

FIX:
The config.js, Supabase JS, and script.js tags are now at the very bottom of index.html,
AFTER all Coding Test HTML.

WHAT TO REPLACE:
Replace ONLY index.html from this package.

You do NOT need to:
- change SQL
- rebuild Docker
- change app.py
- change config.js
- replace style.css
- replace script.js

After replacing:
1. git add index.html
2. git commit -m "Fix coding test admin DOM event binding"
3. git push
4. Wait for GitHub Pages deployment
5. Hard refresh Ctrl+Shift+R

Expected:
Manage Coding Tests -> Create Test -> Step 2 -> Add Question -> Step 3 -> Add Test Case
Close button also works.
