@echo off
git add .
git commit -m "fix(shift): fix 4 critical shift system bugs - auto-fill, balance priority, expense linkage, expected cash" > git_status.txt 2>&1
git push >> git_status.txt 2>&1
