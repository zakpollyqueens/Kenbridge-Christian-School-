const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();
router.post("/staff", async (req,res)=>{
let createdUserId=null;

try{
const authorization=req.headers.authorization;

if(!authorization?.startsWith("Bearer ")){
return res.status(401).json({
success:false,
message:"Administrator authorization token is required."
});
}

const token=authorization.replace("Bearer ","");

const {data:authData,error:authError}=await supabase.auth.getUser(token);

if(authError||!authData?.user){
return res.status(401).json({
success:false,
message:"Invalid or expired administrator session."
});
}

const {rows:adminRows}=await pool.query(
`SELECT id,role,is_active
FROM users
WHERE id=$1
LIMIT 1`,
[authData.user.id]
);

const administrator=adminRows[0];

if(!administrator){
return res.status(403).json({
success:false,
message:"Administrator profile was not found."
});
}

if(!administrator.is_active){
return res.status(403).json({
success:false,
message:"Your administrator account is inactive."
});
}

if(String(administrator.role).toUpperCase()!=="ADMIN"){
return res.status(403).json({
success:false,
message:"Only administrators can create staff accounts."
});
}

const{
full_name,
username,
position,
department,
email,
phone,
password,
notes,
is_active
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

const cleanName=String(full_name).trim();
const cleanUsername=String(username).trim();
const cleanEmail=String(email).trim().toLowerCase();
const cleanPosition=String(position).trim();
const cleanDepartment=String(department).trim();

const portalRole=
cleanPosition.toLowerCase()==="administrator"
?"ADMIN"
:"STAFF";

const {rows:existingUsers}=await pool.query(
`SELECT id
FROM users
WHERE LOWER(email)=LOWER($1)
OR LOWER(username)=LOWER($2)
LIMIT 1`,
[
cleanEmail,
cleanUsername
]
);

if(existingUsers.length){
return res.status(409).json({
success:false,
message:"A staff account with this email or username already exists."
});
}

const{
data:createData,
error:createError
}=await supabase.auth.admin.createUser({
email:cleanEmail,
password:String(password),
email_confirm:true
});

if(createError||!createData?.user){
return res.status(400).json({
success:false,
message:createError?.message||
"Staff authentication account could not be created."
});
}

const newUser=createData.user;

createdUserId=newUser.id;

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

}catch(databaseError){

console.error(
"DATABASE STAFF CREATION ERROR:",
databaseError.message
);

await supabase.auth.admin
.deleteUser(newUser.id)
.catch(deleteError=>{
console.error(
"STAFF AUTH ROLLBACK ERROR:",
deleteError.message
);
});

createdUserId=null;

return res.status(500).json({
success:false,
message:"Staff profile could not be saved in the database."
});
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
is_active:is_active!==false
}
});

}catch(error){

console.error(
"CREATE STAFF SERVER ERROR:",
error.message
);

if(createdUserId){

await supabase.auth.admin
.deleteUser(createdUserId)
.catch(deleteError=>{
console.error(
"UNEXPECTED STAFF ROLLBACK ERROR:",
deleteError.message
);
});

}

return res.status(500).json({
success:false,
message:"An unexpected error occurred while creating the staff account."
});

}
});
