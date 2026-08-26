# اختبار قاعدة البيانات محلياً

يشغّل الملفات الثلاثة كل قواعد النظام على PostgreSQL حقيقي بدون Supabase:
دورة حياة الطلب كاملة، خصم المخزون وإرجاعه، حساب الربح، منع التكرار،
الانتقالات غير المسموحة، عزل الأدوار، وإعادة ضبط البيانات.

```bash
# 1. قاعدة محلية
initdb -D /tmp/pgdata -A trust -U postgres
pg_ctl -D /tmp/pgdata -o "-k /tmp -p 5433" start
psql -h /tmp -p 5433 -U postgres -c "create database shoesos;"

# 2. بديل بسيط لخدمات Supabase (auth.users / auth.uid / الأدوار)
psql -h /tmp -p 5433 -U postgres -d shoesos -f supabase/tests/00_local_stub.sql
psql -h /tmp -p 5433 -U postgres -d shoesos -c \
  "grant usage on schema auth to authenticated, anon;
   grant execute on function auth.uid() to authenticated, anon;
   grant select on auth.users to authenticated;"

# 3. الهجرات ثم الاختبارات
for f in supabase/migrations/000*.sql; do
  psql -h /tmp -p 5433 -U postgres -d shoesos -v ON_ERROR_STOP=1 -q -f "$f"
done
psql -h /tmp -p 5433 -U postgres -d shoesos -f supabase/tests/01_lifecycle.sql
psql -h /tmp -p 5433 -U postgres -d shoesos -f supabase/tests/02_guards_and_roles.sql
```

كل خطوة تطبع سطراً بنتيجتها. أي `NOT BLOCKED (bug)` معناه أن حارساً توقف عن العمل.
