const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

async function getAuthenticatedAdmin(req,res){
const authorization=req.headers.authorization;
if(!authorization?.startsWith("Bearer ")){
res.status(401).json({success:false,message:"Administrator authorization token is required."});
return null;
}

const token=authorization.replace("Bearer ","");
const {data,error}=await supabase.auth.getUser(token);

if(error||!data?.user){
res.status(401).json({success:false,message:"Invalid or expired administrator session."});
return null;
}

const {rows}=await pool.query(
"SELECT id,role,is_active FROM users WHERE id=$1 LIMIT 1",
[data.user.id]
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
}

/*
SETUP INITIAL ADMINISTRATOR
POST /api/auth/setup-admin
*/

router.post("/setup-admin",async(req,res)=>{
try{
if(req.headers["x-setup-secret"]!==process.env.SETUP_SECRET){
return res.status(403).json({
success:false,
message:"Unauthorized setup request."
});
}

const {full_name,email,password}=req.body||{};

if(!full_name||!email||!password){
return res.status(400).json({
success:false,
message:"Full name, email and password are required."
});
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
"INSERT INTO users (id,full_name,email,role,password_hash,is_active) VALUES ($1,$2,$3,$4,$5,$6)",
[
user.id,
String(full_name).trim(),
normalizedEmail,
"ADMIN",
null,
true
]
);
}catch(databaseError){

console.error("DATABASE ADMIN PROFILE ERROR:",databaseError.message);

await supabase.auth.admin.deleteUser(user.id).catch(err=>{
console.error("FAILED TO ROLLBACK SUPABASE USER:",err.message);
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

/*
CREATE STAFF
POST /api/auth/create-staff
*/

router.post("/create-staff",async(req,res)=>{
let createdUserId=null;

try{

const administrator=await getAuthenticatedAdmin(req,res);

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

if(
!full_name||
!username||
!position||
!department||
!email||
!password
){
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

const portalRole=
String(position).trim().toLowerCase()==="administrator"
?"ADMIN"
:"STAFF";

const {data:existingUser}=await supabase.auth.admin.listUsers();

const existingEmail=
existingUser?.users?.find(user=>
String(user.email).toLowerCase()===normalizedEmail
);

if(existingEmail){
return res.status(400).json({
success:false,
message:"A staff account with this email already exists."
});
}

const {data:createdAuthData,error:createAuthError}
=await supabase.auth.admin.createUser({
email:normalizedEmail,
password:String(password),
email_confirm:true
});

if(createAuthError||!createdAuthData?.user){
return res.status(400).json({
success:false,
message:createAuthError?.message||
"Staff authentication account could not be created."
});
}

const createdUser=createdAuthData.user;
createdUserId=createdUser.id;

try{

await pool.query(
"INSERT INTO users (id,full_name,username,email,role,position,department,phone,notes,password_hash,is_active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())",
[
createdUser.id,
String(full_name).trim(),
String(username).trim(),
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

console.error(
"DATABASE STAFF PROFILE ERROR:",
databaseError.message
);

await supabase.auth.admin.deleteUser(createdUser.id).catch(err=>{
console.error(
"FAILED TO ROLLBACK STAFF AUTH ACCOUNT:",
err.message
);
});

return res.status(500).json({
success:false,
message:"Staff profile could not be saved."
});
}

return res.status(201).json({
success:true,
message:"Staff account created successfully.",
user:{
id:createdUser.id,
full_name:String(full_name).trim(),
username:String(username).trim(),
position:String(position).trim(),
department:String(department).trim(),
email:normalizedEmail,
phone:phone?String(phone).trim():null,
role:portalRole,
is_active:is_active!==false,
notes:notes?String(notes).trim():null
}
});

}catch(error){

console.error(
"CREATE STAFF SERVER ERROR:",
error.message
);

if(createdUserId){

await supabase.auth.admin.deleteUser(createdUserId).catch(err=>{
console.error(
"ROLLBACK FAILED:",
err.message
);
});

}

return res.status(500).json({
success:false,
message:"An unexpected error occurred while creating the staff account."
});

}
});

/*
GET STAFF ACCOUNTS
GET /api/auth/staff
*/

router.get("/staff",async(req,res)=>{
try{

const administrator=
await getAuthenticatedAdmin(req,res);

if(!administrator)return;

const staffResult=
await pool.query(
"SELECT id, full_name, username, email, role, position, department, phone, notes, is_active, created_at, updated_at FROM users ORDER BY full_name ASC"
);

return res.status(200).json({
success:true,
staff:staffResult.rows
});

}catch(error){

console.error(
"GET STAFF ACCOUNTS ERROR:",
error.message
);

return res.status(500).json({
success:false,
message:"Unable to retrieve staff accounts."
});
}
});

/*
UPDATE STAFF ACCOUNT
PUT /api/auth/staff/:id
*/

router.put("/staff/:id",async(req,res)=>{
try{

const administrator=
await getAuthenticatedAdmin(req,res);

if(!administrator)return;

const staffId=req.params.id;

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

if(
!full_name||
!username||
!position||
!department||
!email
){
return res.status(400).json({
success:false,
message:"Full name, username, position, department and email are required."
});
}

const normalizedEmail=
String(email).trim().toLowerCase();

const portalRole=
String(position).trim().toLowerCase()==="administrator"
?"ADMIN"
:"STAFF";

const existingResult=
await pool.query(
"SELECT id FROM users WHERE id=$1 LIMIT 1",
[staffId]
);

if(existingResult.rows.length===0){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

const duplicateEmailResult=
await pool.query(
"SELECT id FROM users WHERE email=$1 AND id<>$2 LIMIT 1",
[
normalizedEmail,
staffId
]
);

if(duplicateEmailResult.rows.length>0){
return res.status(400).json({
success:false,
message:"Another staff account already uses this email address."
});
}

await pool.query(
"UPDATE users SET full_name=$1, username=$2, email=$3, role=$4, position=$5, department=$6, phone=$7, notes=$8, is_active=$9, updated_at=NOW() WHERE id=$10",
[
String(full_name).trim(),
String(username).trim(),
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

await supabase.auth.admin.updateUserById(
staffId,
{
email:normalizedEmail
}
);

return res.status(200).json({
success:true,
message:"Staff account updated successfully."
});

}catch(error){

console.error(
"UPDATE STAFF ERROR:",
error.message
);

return res.status(500).json({
success:false,
message:"Unable to update staff account."
});
}
});

/*
ENABLE OR DISABLE STAFF
PATCH /api/auth/staff/:id/status
*/

router.patch("/staff/:id/status",async(req,res)=>{
try{

const administrator=
await getAuthenticatedAdmin(req,res);

if(!administrator)return;

const staffId=req.params.id;
const {is_active}=req.body||{};

if(typeof is_active!=="boolean"){
return res.status(400).json({
success:false,
message:"is_active must be true or false."
});
}

const staffResult=
await pool.query(
"SELECT id FROM users WHERE id=$1 LIMIT 1",
[staffId]
);

if(staffResult.rows.length===0){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

await pool.query(
"UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2",
[
is_active,
staffId
]
);

return res.status(200).json({
success:true,
message:is_active
?"Staff account enabled successfully."
:"Staff account disabled successfully."
});

}catch(error){

console.error(
"UPDATE STAFF STATUS ERROR:",
error.message
);

return res.status(500).json({
success:false,
message:"Unable to update staff account status."
});
}
});

/*
DELETE STAFF ACCOUNT
DELETE /api/auth/staff/:id
*/

router.delete("/staff/:id",async(req,res)=>{
try{

const administrator=
await getAuthenticatedAdmin(req,res);

if(!administrator)return;

const staffId=req.params.id;

if(String(administrator.id)===String(staffId)){
return res.status(400).json({
success:false,
message:"You cannot delete your own administrator account."
});
}

const staffResult=
await pool.query(
"SELECT id FROM users WHERE id=$1 LIMIT 1",
[staffId]
);

if(staffResult.rows.length===0){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

/*
DELETE POSTGRESQL PROFILE FIRST
*/

await pool.query(
"DELETE FROM users WHERE id=$1",
[staffId]
);

/*
DELETE SUPABASE AUTH ACCOUNT
*/

const {error:deleteError}=
await supabase.auth.admin.deleteUser(
staffId
);

if(deleteError){

console.error(
"SUPABASE DELETE USER ERROR:",
deleteError.message
);

return res.status(500).json({
success:false,
message:"Staff database profile was deleted but authentication account could not be removed."
});
}

return res.status(200).json({
success:true,
message:"Staff account deleted successfully."
});

}catch(error){

console.error(
"DELETE STAFF ERROR:",
error.message
);

return res.status(500).json({
success:false,
message:"Unable to delete staff account."
});
}
});

/*
LOGIN
POST /api/auth/login
*/

router.post("/login",async(req,res)=>{
try{

const {email,password}=req.body||{};

if(!email||!password){
return res.status(400).json({
success:false,
message:"Email and password are required."
});
}

const {data,error}=
await supabase.auth.signInWithPassword({
email:String(email).trim(),
password
});

if(error||!data?.user||!data?.session){
return res.status(401).json({
success:false,
message:"Invalid email or password."
});
}

const {rows}=
await pool.query(
"SELECT id, full_name, email, role, is_active FROM users WHERE id=$1 LIMIT 1",
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

console.error(
"LOGIN SERVER ERROR:",
error.message
);

return res.status(500).json({
success:false,
message:"An unexpected error occurred during login."
});
}
});

/*
CURRENT AUTHENTICATED USER
GET /api/auth/me
*/

router.get("/me",async(req,res)=>{
try{

const authorization=
req.headers.authorization;

if(!authorization?.startsWith("Bearer ")){
return res.status(401).json({
success:false,
message:"Authorization token is required."
});
}

const {data,error}=
await supabase.auth.getUser(
authorization.replace("Bearer ","")
);

if(error||!data?.user){
return res.status(401).json({
success:false,
message:"Invalid or expired token."
});
}

const {rows}=
await pool.query(
"SELECT id, full_name, email, role, is_active FROM users WHERE id=$1 LIMIT 1",
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
user:{
id:profile.id,
full_name:profile.full_name,
email:profile.email,
role:profile.role
}
});

}catch(error){

console.error(
"AUTHENTICATION ERROR:",
error.message
);

return res.status(500).json({
success:false,
message:"Authentication failed."
});
}
});

module.exports=router;
