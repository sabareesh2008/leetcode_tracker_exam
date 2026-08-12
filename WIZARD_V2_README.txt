CODING TEST ADMIN WIZARD V2

Replace only:
- index.html
- style.css
- script.js

No SQL change.
No Docker change.
No config.js change.

Why this fixes the problem:
- Step 1 / Step 2 / Step 3 are now REAL clickable buttons.
- Only the selected step panel is shown.
- After Create Test -> automatically moves to Step 2.
- After Add Question -> automatically moves to Step 3.
- Existing tests have a Select button.
- Existing questions have a Select for Test Cases button.
- You cannot enter Step 2 without selecting a test.
- You cannot enter Step 3 without selecting a question.
- Question and Test Case lists are visible, so navigation never gets stuck.

Expected flow:
Create Test -> Step 2 -> Add Question -> Step 3 -> Add cases
-> Add Another Question -> Step 2 -> repeat -> Publish
