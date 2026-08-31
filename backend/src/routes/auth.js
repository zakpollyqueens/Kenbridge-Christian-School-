const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

async function requireAdmin(req,res){
try{
const authorization=req.headers.authorization;

if(!authorization?.startsWith("Bearer ")){
res.status(401).json({success:false,message:"Administrator authorization token is required."});
return null;
}

const token=authorization.replace("Bearer ","");
const {data:authData,error:authError}=await supabase.auth.getUser(token);

if(authError||!authData?.user){
res.status(401).json({success:false,message:"Invalid or expired administrator session."});
return null;
}

const {rows}=await pool.query(
"SELECT id,role,is_active FROM users WHERE id=$1 LIMIT 1",
[authData.user.id]
);

const administrator=rows[0];

if(!administrator){
res.status(403).json({success:false,message:"Administrator profile was not found."});
return null;
}

if(!administrator.is_active){
res.status(403).json({success:false,message:"Your administrator account is inactive."});
return null;
}

if(String(administrator.role).toUpperCase()!=="ADMIN"){
res.status(403).json({success:false,message:"Only administrators can perform this action."});
return null;
}

return administrator;
}catch(error){
console.error("ADMIN AUTHORIZATION ERROR:",error.message);
res.status(500).json({success:false,message:"Unable to verify administrator authorization."});
return null;
}
}

router.post("/setup-admin",async(req,res)=>{
try{
if(req.headers["x-setup-secret"]!==process.env.SETUP_SECRET){
return res.status(403).json({success:false,message:"Unauthorized setup request."});
}

const {full_name,email,password}=req.body||{};

if(!full_name||!email||!password){
return res.status(400).json({success:false,message:"Full name, email and password are required."});
}

const normalizedEmail=String(email).trim().toLowerCase();

const {data,error}=await supabase.auth.admin.createUser({
email:normalizedEmail,
password:String(password),
email_confirm:true
});

if(error||!data?.user){
return res.status(400).json({
success:false,
message:error?.message||"User creation failed."
});
}

const user=data.user;

try{
await pool.query(
`INSERT INTO users(id,full_name,email,role,password_hash,is_active)
VALUES($1,$2,$3,$4,$5,$6)`,
[user.id,String(full_name).trim(),normalizedEmail,"ADMIN",null,true]
);
}catch(databaseError){
console.error("DATABASE ADMIN PROFILE ERROR:",databaseError.message);

await supabase.auth.admin.deleteUser(user.id).catch(err=>{
console.error("ADMIN ROLLBACK ERROR:",err.message);
});

return res.status(500).json({
success:false,
message:"Administrator profile could not be created."
});
}

return res.status(201).json({
success:true,
message:"Administrator account created successfully.",
user:{
id:user.id,
full_name:String(full_name).trim(),
email:normalizedEmail,
role:"ADMIN"
}
});

}catch(error){
console.error("ADMIN SETUP ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Failed to create administrator account."
});
}
});

router.post("/create-staff",async(req,res)=>{
let createdUserId=null;

try{
const administrator=await requireAdmin(req,res);
if(!administrator)return;

const {
full_name,
username,
position,
department,
email,
phone,
password,
is_active,
notes
}=req.body||{};

if(!full_name||!username||!position||!department||!email||!password){
return res.status(400).json({
success:false,
message:"Full name, username, position, department, email and password are required."
});
}

if(String(password).length<6){
return res.status(400).json({
success:false,
message:"Password must contain at least 6 characters."
});
}

const normalizedEmail=String(email).trim().toLowerCase();
const normalizedUsername=String(username).trim();

const duplicateEmail=await pool.query(
"SELECT id FROM users WHERE email=$1 LIMIT 1",
[normalizedEmail]
);

if(duplicateEmail.rows.length){
return res.status(400).json({
success:false,
message:"Another account already uses this email address."
});
}

const duplicateUsername=await pool.query(
"SELECT id FROM users WHERE username=$1 LIMIT 1",
[normalizedUsername]
);

if(duplicateUsername.rows.length){
return res.status(400).json({
success:false,
message:"Another account already uses this username."
});
}

const portalRole=String(position).trim().toLowerCase()==="administrator"
?"ADMIN"
:"STAFF";

const {data:createdAuthData,error:createAuthError}=await supabase.auth.admin.createUser({
email:normalizedEmail,
password:String(password),
email_confirm:true
});

if(createAuthError||!createdAuthData?.user){
return res.status(400).json({
success:false,
message:createAuthError?.message||"Staff authentication account could not be created."
});
}

const createdUser=createdAuthData.user;
createdUserId=createdUser.id;

try{
await pool.query(
`INSERT INTO users(
id,
full_name,
username,
email,
role,
position,
department,
phone,
notes,
password_hash,
is_active,
created_at,
updated_at
)
VALUES(
$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()
)`,
[
createdUser.id,
String(full_name).trim(),
normalizedUsername,
normalizedEmail,
portalRole,
String(position).trim(),
String(department).trim(),
phone?String(phone).trim():null,
notes?String(notes).trim():null,
null,
is_active!==false
]
);
}catch(databaseError){
console.error("DATABASE STAFF PROFILE ERROR:",databaseError.message);

await supabase.auth.admin.deleteUser(createdUser.id).catch(err=>{
console.error("STAFF ROLLBACK ERROR:",err.message);
});

return res.status(500).json({
success:false,
message:"Staff authentication account was created, but the staff profile could not be saved."
});
}

return res.status(201).json({
success:true,
message:"Staff account created successfully.",
staff:{
id:createdUser.id,
full_name:String(full_name).trim(),
username:normalizedUsername,
email:normalizedEmail,
role:portalRole,
position:String(position).trim(),
department:String(department).trim(),
phone:phone?String(phone).trim():null,
notes:notes?String(notes).trim():null,
is_active:is_active!==false
}
});

}catch(error){
console.error("CREATE STAFF SERVER ERROR:",error.message);

if(createdUserId){
await supabase.auth.admin.deleteUser(createdUserId).catch(err=>{
console.error("STAFF FINAL ROLLBACK ERROR:",err.message);
});
}

return res.status(500).json({
success:false,
message:"An unexpected error occurred while creating the staff account."
});
}
});

router.post("/login",async(req,res)=>{
try{
const {email,password}=req.body||{};

if(!email||!password){
return res.status(400).json({
success:false,
message:"Email and password are required."
});
}

const {data,error}=await supabase.auth.signInWithPassword({
email:String(email).trim().toLowerCase(),
password:String(password)
});

if(error||!data?.user||!data?.session){
return res.status(401).json({
success:false,
message:error?.message||"Invalid email or password."
});
}

const {rows}=await pool.query(
"SELECT id,full_name,email,role,is_active FROM users WHERE id=$1 LIMIT 1",
[data.user.id]
);

const profile=rows[0];

if(!profile){
return res.status(403).json({
success:false,
message:"Account is not registered in the staff system."
});
}

if(!profile.is_active){
return res.status(403).json({
success:false,
message:"This account is inactive."
});
}

return res.status(200).json({
success:true,
message:"Login successful.",
user:{
id:profile.id,
full_name:profile.full_name,
email:profile.email,
role:profile.role
},
session:{
access_token:data.session.access_token,
refresh_token:data.session.refresh_token,
expires_at:data.session.expires_at
}
});

}catch(error){
console.error("LOGIN SERVER ERROR:",error.message);
return res.status(500).json({
success:false,
message:"An unexpected error occurred during login."
});
}
});

router.get("/me",async(req,res)=>{
try{
const authorization=req.headers.authorization;

if(!authorization?.startsWith("Bearer ")){
return res.status(401).json({
success:false,
message:"Authorization token is required."
});
}

const token=authorization.replace("Bearer ","");
const {data,error}=await supabase.auth.getUser(token);

if(error||!data?.user){
return res.status(401).json({
success:false,
message:"Invalid or expired token."
});
}

const {rows}=await pool.query(
`SELECT id,full_name,username,email,role,position,department,phone,notes,is_active
FROM users WHERE id=$1 LIMIT 1`,
[data.user.id]
);

const profile=rows[0];

if(!profile){
return res.status(403).json({
success:false,
message:"Authenticated account has no staff profile."
});
}

if(!profile.is_active){
return res.status(403).json({
success:false,
message:"This account is inactive."
});
}

return res.status(200).json({
success:true,
user:profile
});

}catch(error){
console.error("AUTHENTICATION ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Authentication failed."
});
}
});

router.get("/staff",async(req,res)=>{
try{
const administrator=await requireAdmin(req,res);
if(!administrator)return;

const {rows}=await pool.query(
`SELECT
id,
full_name,
username,
email,
role,
position,
department,
phone,
notes,
is_active,
created_at,
updated_at
FROM users
ORDER BY full_name ASC`
);

return res.status(200).json({
success:true,
staff:rows
});

}catch(error){
console.error("GET STAFF ACCOUNTS ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to retrieve staff accounts."
});
}
});

router.get("/staff/:id",async(req,res)=>{
try{
const administrator=await requireAdmin(req,res);
if(!administrator)return;

const {rows}=await pool.query(
`SELECT
id,
full_name,
username,
email,
role,
position,
department,
phone,
notes,
is_active,
created_at,
updated_at
FROM users
WHERE id=$1
LIMIT 1`,
[req.params.id]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

return res.status(200).json({
success:true,
staff:rows[0]
});

}catch(error){
console.error("GET STAFF ACCOUNT ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to retrieve the staff account."
});
}
});

router.put("/staff/:id",async(req,res)=>{
try{
const administrator=await requireAdmin(req,res);
if(!administrator)return;

const {
full_name,
username,
position,
department,
email,
phone,
notes,
is_active
}=req.body||{};

if(!full_name||!username||!position||!department||!email){
return res.status(400).json({
success:false,
message:"Full name, username, position, department and email are required."
});
}

const staffId=req.params.id;
const normalizedEmail=String(email).trim().toLowerCase();
const normalizedUsername=String(username).trim();

const duplicateEmail=await pool.query(
"SELECT id FROM users WHERE email=$1 AND id<>$2 LIMIT 1",
[normalizedEmail,staffId]
);

if(duplicateEmail.rows.length){
return res.status(400).json({
success:false,
message:"Another staff account already uses this email address."
});
}

const duplicateUsername=await pool.query(
"SELECT id FROM users WHERE username=$1 AND id<>$2 LIMIT 1",
[normalizedUsername,staffId]
);

if(duplicateUsername.rows.length){
return res.status(400).json({
success:false,
message:"Another staff account already uses this username."
});
}

const portalRole=String(position).trim().toLowerCase()==="administrator"
?"ADMIN"
:"STAFF";

const {rows}=await pool.query(
`UPDATE users
SET
full_name=$1,
username=$2,
email=$3,
role=$4,
position=$5,
department=$6,
phone=$7,
notes=$8,
is_active=$9,
updated_at=NOW()
WHERE id=$10
RETURNING
id,
full_name,
username,
email,
role,
position,
department,
phone,
notes,
is_active,
created_at,
updated_at`,
[
String(full_name).trim(),
normalizedUsername,
normalizedEmail,
portalRole,
String(position).trim(),
String(department).trim(),
phone?String(phone).trim():null,
notes?String(notes).trim():null,
is_active!==false,
staffId
]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

return res.status(200).json({
success:true,
message:"Staff account updated successfully.",
staff:rows[0]
});

}catch(error){
console.error("UPDATE STAFF ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to update staff account."
});
}
});

router.patch("/staff/:id/status",async(req,res)=>{
try{
const administrator=await requireAdmin(req,res);
if(!administrator)return;

const {is_active}=req.body||{};

if(typeof is_active!=="boolean"){
return res.status(400).json({
success:false,
message:"is_active must be true or false."
});
}

const {rows}=await pool.query(
`UPDATE users
SET is_active=$1,updated_at=NOW()
WHERE id=$2
RETURNING id,full_name,username,is_active`,
[is_active,req.params.id]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

return res.status(200).json({
success:true,
message:is_active
?"Staff account enabled successfully."
:"Staff account disabled successfully.",
staff:rows[0]
});

}catch(error){
console.error("STAFF STATUS ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to update staff status."
});
}
});

router.delete("/staff/:id",async(req,res)=>{
try{
const administrator=await requireAdmin(req,res);
if(!administrator)return;

const staffId=req.params.id;

if(staffId===administrator.id){
return res.status(400).json({
success:false,
message:"You cannot delete your own administrator account."
});
}

const {rows}=await pool.query(
"SELECT id FROM users WHERE id=$1 LIMIT 1",
[staffId]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

const {error:deleteAuthError}=await supabase.auth.admin.deleteUser(staffId);

if(deleteAuthError){
console.error("SUPABASE DELETE ERROR:",deleteAuthError.message);

return res.status(500).json({
success:false,
message:"Unable to delete the staff authentication account."
});
}

await pool.query(
"DELETE FROM users WHERE id=$1",
[staffId]
);

return res.status(200).json({
success:true,
message:"Staff account deleted successfully."
});

}catch(error){
console.error("DELETE STAFF ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to delete staff account."
});
}
});

module.exports=router;
