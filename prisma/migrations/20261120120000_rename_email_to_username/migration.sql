-- Replace email logins with username logins.
-- 1) Rename the columns (keeps the unique indexes, renamed to match).
-- 2) Derive a username from the existing address by keeping the local part
--    before the "@" (e.g. "admin@dept.edu" -> "admin"), so every seeded /
--    issued credential keeps working without any emails in the flow.
ALTER TABLE "professors" RENAME COLUMN "email" TO "username";
ALTER TABLE "students" RENAME COLUMN "email" TO "username";

ALTER INDEX "professors_email_key" RENAME TO "professors_username_key";
ALTER INDEX "students_email_key" RENAME TO "students_username_key";

UPDATE "professors" SET "username" = split_part("username", '@', 1);
UPDATE "students" SET "username" = split_part("username", '@', 1);
