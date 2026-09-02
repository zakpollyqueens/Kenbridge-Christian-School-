const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");
const router=express.Router();

async function getAuthenticatedUser(req,res){
try{
const authorization=req.headers.authorization;
if(!authorization?.startsWith("Bearer ")){
res.status(401).json({success:false,message:"Authorization token is required."});
return null;
}
const token=authorization.replace("Bearer ","");
const {data,error}=await supabase.auth.getUser(token);
if(error||!data?.user){
res.status(401).json({success:false,message:"Invalid or expired token."});
return null;
}
return data.user;
}catch(error){
console.error("AUTH TOKEN ERROR:",error.message);
res.status(500).json({success:false,message:"Unable to verify authentication."});
return null;
}
}

async function getAdministrator(req,res){
const authUser=await getAuthenticatedUser(req,res);
if(!authUser)return null;
try{
const {rows}=await pool.query(
`SELECT id,full_name,email,role,is_active FROM users WHERE id=$1 LIMIT 1`,
[authUser.id]
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

function cleanClasses(classes){
if(!Array.isArray(classes))return[];
return [...new Set(classes.map(v=>String(v||"").trim().toUpperCase()).filter(Boolean))];
}

async function getStaffClasses(staffId){
const {rows}=await pool.query(
`SELECT class_name FROM staff_class_permissions WHERE staff_id=$1 ORDER BY class_name ASC`,
[staffId]
);
return rows.map(row=>row.class_name);
}

router.post("/setup-admin",async(req,res)=>{
let createdUserId=null;
try{
if(req.headers["x-setup-secret"]!==process.env.SETUP_SECRET){
return res.status(403).json({success:false,message:"Unauthorized setup request."});
}
const{full_name,email,password}=req.body||{};
if(!full_name||!email||!password){
return res.status(400).json({success:false,message:"Full name, email and password are required."});
}
if(String(password).length<6){
return res.status(400).json({success:false,message:"Password must contain at least 6 characters."});
}
const cleanName=String(full_name).trim();
const cleanEmail=String(email).trim().toLowerCase();
const{data,error}=await supabase.auth.admin.createUser({
email:cleanEmail,password:String(password),email_confirm:true
});
if(error||!data?.user){
return res.status(400).json({
success:false,
message:error?.message||"Administrator authentication account could not be created."
});
}
const user=data.user;
createdUserId=user.id;
try{
await pool.query(
`INSERT INTO users(id,full_name,email,role,password_hash,is_active,created_at,updated_at)
VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
[user.id,cleanName,cleanEmail,"ADMIN",null,true]
);
}catch(databaseError){
console.error("DATABASE ADMIN PROFILE ERROR:",databaseError.message);
await supabase.auth.admin.deleteUser(user.id).catch(()=>{});
createdUserId=null;
return res.status(500).json({
success:false,
message:"Administrator profile could not be created."
});
}
createdUserId=null;
return res.status(201).json({
success:true,
message:"Administrator account created successfully.",
user:{id:user.id,full_name:cleanName,email:cleanEmail,role:"ADMIN"}
});
}catch(error){
console.error("ADMIN SETUP ERROR:",error.message);
if(createdUserId){
await supabase.auth.admin.deleteUser(createdUserId).catch(()=>{});
}
return res.status(500).json({success:false,message:"Failed to create administrator account."});
}
});

router.post("/login",async(req,res)=>{
try{
const{email,password}=req.body||{};
if(!email||!password){
return res.status(400).json({success:false,message:"Email and password are required."});
}
const cleanEmail=String(email).trim().toLowerCase();
const{data,error}=await supabase.auth.signInWithPassword({
email:cleanEmail,password:String(password)
});
if(error||!data?.user||!data?.session){
return res.status(401).json({success:false,message:"Invalid email or password."});
}
const{rows}=await pool.query(
`SELECT id,full_name,username,email,role,position,department,phone,notes,is_active
FROM users WHERE id=$1 LIMIT 1`,
[data.user.id]
);
const profile=rows[0];
if(!profile){
return res.status(403).json({
success:false,
message:"Account is not registered in the Kenbridge staff system."
});
}
if(!profile.is_active){
return res.status(403).json({success:false,message:"This account is inactive."});
}
const classes=String(profile.role).toUpperCase()==="ADMIN"?[]:await getStaffClasses(profile.id);
return res.status(200).json({
success:true,
message:"Login successful.",
user:{
id:profile.id,
full_name:profile.full_name,
username:profile.username,
email:profile.email,
role:profile.role,
position:profile.position,
department:profile.department,
phone:profile.phone,
notes:profile.notes,
classes
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
const authUser=await getAuthenticatedUser(req,res);
if(!authUser)return;
try{
const{rows}=await pool.query(
`SELECT id,full_name,username,email,role,position,department,phone,notes,is_active
FROM users WHERE id=$1 LIMIT 1`,
[authUser.id]
);
const profile=rows[0];
if(!profile){
return res.status(403).json({
success:false,
message:"Authenticated account has no staff profile."
});
}
if(!profile.is_active){
return res.status(403).json({success:false,message:"This account is inactive."});
}
const classes=String(profile.role).toUpperCase()==="ADMIN"?[]:await getStaffClasses(profile.id);
return res.status(200).json({
success:true,
user:{
id:profile.id,
full_name:profile.full_name,
username:profile.username,
email:profile.email,
role:profile.role,
position:profile.position,
department:profile.department,
phone:profile.phone,
notes:profile.notes,
classes
}
});
}catch(error){
console.error("AUTHENTICATION ERROR:",error.message);
return res.status(500).json({success:false,message:"Authentication failed."});
}
});

router.post("/staff",async(req,res)=>{
let createdUserId=null;
const administrator=await getAdministrator(req,res);
if(!administrator)return;
try{
const{
full_name,username,position,department,email,
phone,password,notes,is_active,classes
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

const cleanName=String(full_name).trim();
const cleanUsername=String(username).trim();
const cleanEmail=String(email).trim().toLowerCase();
const cleanPosition=String(position).trim();
const cleanDepartment=String(department).trim();
const portalRole=cleanPosition.toLowerCase()==="administrator"?"ADMIN":"STAFF";
const cleanAssignedClasses=cleanClasses(classes);

const{rows:existingUsers}=await pool.query(
`SELECT id FROM users
WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($2)
LIMIT 1`,
[cleanEmail,cleanUsername]
);

if(existingUsers.length){
return res.status(409).json({
success:false,
message:"A staff account with this email or username already exists."
});
}

const{data:createData,error:createError}=await supabase.auth.admin.createUser({
email:cleanEmail,
password:String(password),
email_confirm:true
});

if(createError||!createData?.user){
return res.status(400).json({
success:false,
message:createError?.message||"Staff authentication account could not be created."
});
}

const newUser=createData.user;
createdUserId=newUser.id;
const client=await pool.connect();

try{
await client.query("BEGIN");

await client.query(
`INSERT INTO users
(id,full_name,username,email,role,position,department,phone,notes,password_hash,is_active,created_at,updated_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
[
newUser.id,
cleanName,
cleanUsername,
cleanEmail,
portalRole,
cleanPosition,
cleanDepartment,
phone?String(phone).trim():null,
notes?String(notes).trim():null,
null,
is_active!==false
]
);

if(portalRole!=="ADMIN"){
for(const className of cleanAssignedClasses){
await client.query(
`INSERT INTO staff_class_permissions(staff_id,class_name)
VALUES($1,$2)`,
[newUser.id,className]
);
}
}

await client.query("COMMIT");
}catch(databaseError){
await client.query("ROLLBACK");
throw databaseError;
}finally{
client.release();
}

createdUserId=null;

return res.status(201).json({
success:true,
message:"Staff account created successfully.",
staff:{
id:newUser.id,
full_name:cleanName,
username:cleanUsername,
email:cleanEmail,
role:portalRole,
position:cleanPosition,
department:cleanDepartment,
phone:phone?String(phone).trim():null,
notes:notes?String(notes).trim():null,
is_active:is_active!==false,
classes:portalRole==="ADMIN"?[]:cleanAssignedClasses
}
});

}catch(error){
console.error("CREATE STAFF SERVER ERROR:",error.message);

if(createdUserId){
await pool.query(
`DELETE FROM staff_class_permissions WHERE staff_id=$1`,
[createdUserId]
).catch(()=>{});

await pool.query(
`DELETE FROM users WHERE id=$1`,
[createdUserId]
).catch(()=>{});

await supabase.auth.admin.deleteUser(createdUserId).catch(()=>{});
}

return res.status(500).json({
success:false,
message:"An unexpected error occurred while creating the staff account."
});
}
});

router.get("/staff",async(req,res)=>{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

try{
const{rows:staff}=await pool.query(
`SELECT
u.id,u.full_name,u.username,u.email,u.role,u.position,
u.department,u.phone,u.notes,u.is_active,u.created_at,u.updated_at,
COALESCE(
ARRAY_AGG(
DISTINCT UPPER(TRIM(scp.class_name))
ORDER BY UPPER(TRIM(scp.class_name))
) FILTER(WHERE scp.class_name IS NOT NULL),
'{}'
) AS classes
FROM users u
LEFT JOIN staff_class_permissions scp ON scp.staff_id=u.id
GROUP BY
u.id,u.full_name,u.username,u.email,u.role,u.position,
u.department,u.phone,u.notes,u.is_active,u.created_at,u.updated_at
ORDER BY u.full_name ASC`
);

return res.status(200).json({success:true,staff});

}catch(error){
console.error("GET STAFF ACCOUNTS ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to retrieve staff accounts."
});
}
});

router.get("/staff/:id",async(req,res)=>{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

try{
const{rows}=await pool.query(
`SELECT
id,full_name,username,email,role,position,
department,phone,notes,is_active,created_at,updated_at
FROM users
WHERE id=$1
LIMIT 1`,
[req.params.id]
);

const staff=rows[0];

if(!staff){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

staff.classes=
String(staff.role).toUpperCase()==="ADMIN"
?[]
:await getStaffClasses(staff.id);

return res.status(200).json({
success:true,
staff
});

}catch(error){
console.error("GET STAFF ACCOUNT ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to retrieve staff account."
});
}
});

router.put("/staff/:id",async(req,res)=>{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

try{
const{
full_name,username,position,department,
email,phone,notes,is_active,classes
}=req.body||{};

if(!full_name||!username||!position||!department||!email){
return res.status(400).json({
success:false,
message:"Full name, username, position, department and email are required."
});
}

const cleanName=String(full_name).trim();
const cleanUsername=String(username).trim();
const cleanEmail=String(email).trim().toLowerCase();
const cleanPosition=String(position).trim();
const cleanDepartment=String(department).trim();
const portalRole=cleanPosition.toLowerCase()==="administrator"?"ADMIN":"STAFF";
const cleanAssignedClasses=cleanClasses(classes);

const{rows:existingUsers}=await pool.query(
`SELECT id FROM users
WHERE (LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($2))
AND id<>$3
LIMIT 1`,
[cleanEmail,cleanUsername,req.params.id]
);

if(existingUsers.length){
return res.status(409).json({
success:false,
message:"Another staff account already uses this email or username."
});
}

const client=await pool.connect();
let staff;

try{
await client.query("BEGIN");

const{rows}=await client.query(
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
id,full_name,username,email,role,position,
department,phone,notes,is_active,created_at,updated_at`,
[
cleanName,
cleanUsername,
cleanEmail,
portalRole,
cleanPosition,
cleanDepartment,
phone?String(phone).trim():null,
notes?String(notes).trim():null,
is_active!==false,
req.params.id
]
);

staff=rows[0];

if(!staff){
await client.query("ROLLBACK");
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

await client.query(
`DELETE FROM staff_class_permissions WHERE staff_id=$1`,
[staff.id]
);

if(portalRole!=="ADMIN"){
for(const className of cleanAssignedClasses){
await client.query(
`INSERT INTO staff_class_permissions(staff_id,class_name)
VALUES($1,$2)`,
[staff.id,className]
);
}
}

await client.query("COMMIT");

}catch(error){
await client.query("ROLLBACK");
throw error;
}finally{
client.release();
}

staff.classes=
portalRole==="ADMIN"
?[]
:cleanAssignedClasses;

return res.status(200).json({
success:true,
message:"Staff account updated successfully.",
staff
});

}catch(error){
console.error("UPDATE STAFF ERROR:",error.message);

if(error.code==="23505"){
return res.status(409).json({
success:false,
message:"Another staff account already uses this email or username."
});
}

return res.status(500).json({
success:false,
message:"Unable to update staff account."
});
}
});

router.patch("/staff/:id/status",async(req,res)=>{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

try{
const{is_active}=req.body||{};

if(typeof is_active!=="boolean"){
return res.status(400).json({
success:false,
message:"A valid account status is required."
});
}

if(String(req.params.id)===String(administrator.id)&&is_active===false){
return res.status(400).json({
success:false,
message:"You cannot disable your own administrator account."
});
}

const{rows}=await pool.query(
`UPDATE users
SET is_active=$1,updated_at=NOW()
WHERE id=$2
RETURNING
id,full_name,username,email,role,position,
department,is_active`,
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
console.error("UPDATE STAFF STATUS ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to update staff account status."
});
}
});

router.delete("/staff/:id",async(req,res)=>{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

try{
if(String(req.params.id)===String(administrator.id)){
return res.status(400).json({
success:false,
message:"You cannot delete your own administrator account."
});
}

const staffId=req.params.id;

const{rows}=await pool.query(
`SELECT id,email FROM users WHERE id=$1 LIMIT 1`,
[staffId]
);

if(!rows[0]){
return res.status(404).json({
success:false,
message:"Staff account was not found."
});
}

await pool.query(
`DELETE FROM staff_class_permissions WHERE staff_id=$1`,
[staffId]
);

const{rows:deletedRows}=await pool.query(
`DELETE FROM users WHERE id=$1 RETURNING id`,
[staffId]
);

if(!deletedRows[0]){
return res.status(500).json({
success:false,
message:"Staff profile could not be deleted."
});
}

const{error:deleteAuthError}=await supabase.auth.admin.deleteUser(staffId);

if(deleteAuthError){
console.error("SUPABASE STAFF DELETE ERROR:",deleteAuthError.message);
}

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

router.get("/settings",async(req,res)=>{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

try{
const{rows}=await pool.query(
`SELECT notifications,auto_refresh,content_status,portal_language
FROM user_settings
WHERE user_id=$1
LIMIT 1`,
[administrator.id]
);

const settings=rows[0]||{
notifications:true,
auto_refresh:false,
content_status:"pending",
portal_language:"en"
};

return res.status(200).json({
success:true,
settings:{
notifications:settings.notifications,
autoRefresh:settings.auto_refresh,
contentStatus:settings.content_status,
portalLanguage:settings.portal_language
}
});

}catch(error){
console.error("GET SETTINGS ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to load administrator settings."
});
}
});

router.put("/settings",async(req,res)=>{
const administrator=await getAdministrator(req,res);
if(!administrator)return;

try{
const{
notifications,
autoRefresh,
contentStatus,
portalLanguage
}=req.body||{};

if(typeof notifications!=="boolean"||typeof autoRefresh!=="boolean"){
return res.status(400).json({
success:false,
message:"Notifications and auto refresh settings must be true or false."
});
}

if(!["pending","draft"].includes(contentStatus)){
return res.status(400).json({
success:false,
message:"Invalid default content status."
});
}

if(portalLanguage!=="en"){
return res.status(400).json({
success:false,
message:"Invalid portal language."
});
}

const{rows}=await pool.query(
`INSERT INTO user_settings(
user_id,notifications,auto_refresh,
content_status,portal_language,
created_at,updated_at
)
VALUES($1,$2,$3,$4,$5,NOW(),NOW())
ON CONFLICT(user_id)
DO UPDATE SET
notifications=EXCLUDED.notifications,
auto_refresh=EXCLUDED.auto_refresh,
content_status=EXCLUDED.content_status,
portal_language=EXCLUDED.portal_language,
updated_at=NOW()
RETURNING
notifications,auto_refresh,
content_status,portal_language`,
[
administrator.id,
notifications,
autoRefresh,
contentStatus,
portalLanguage
]
);

const settings=rows[0];

return res.status(200).json({
success:true,
message:"Settings saved successfully.",
settings:{
notifications:settings.notifications,
autoRefresh:settings.auto_refresh,
contentStatus:settings.content_status,
portalLanguage:settings.portal_language
}
});

}catch(error){
console.error("SAVE SETTINGS ERROR:",error.message);
return res.status(500).json({
success:false,
message:"Unable to save administrator settings."
});
}
});

module.exports=router;
