ONE ATTEMPT + END TEST FINAL UPDATE

What changed:
- Submit Test replaced with End Test.
- End Test asks for confirmation TWICE.
- After ending, all final hidden/public test cases are judged.
- Result screen shows only:
  ALL TEST CASES PASSED
  or
  NOT ALL TEST CASES PASSED
  plus passed/total test-case count.
- Result returns to leaderboard after 5 seconds.
- Completed students cannot attend the same test again.
- An unfinished in-progress attempt is resumed, not duplicated.
- Database unique index enforces one attempt per student per test.

Replace:
- index.html
- style.css
- script.js
- coding_test_full_integration.sql

Then:
1. Run coding_test_full_integration.sql again in Supabase.
2. No Docker rebuild is required.
3. Hard refresh Live Server.
4. Test with a fresh coding test or a student who has not completed that test.
