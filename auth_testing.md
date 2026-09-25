# Auth Testing Playbook
1. mongosh test_database: db.users.find({role:"admin"}) -> password_hash starts with $2b$; indexes users.email unique, login_attempts.identifier.
2. curl -c cookies.txt -X POST $URL/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@scada.id","password":"admin123"}'
3. curl -b cookies.txt $URL/api/auth/me  (or -H "Authorization: Bearer <token>")
