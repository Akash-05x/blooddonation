-- AddForeignKey
ALTER TABLE "pending_hospitals" ADD CONSTRAINT "pending_hospitals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
