const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

const ALLOWED_CLASSES=["BABY","MIDDLE","TOP","P1","P2","P3","P4","P5","P6","P7"];

async function getAuthenticatedUser(req){
const authorization=req.headers.authorization;
if(!authorization?.startsWith("Bearer "))throw new Error("Authorization token is required.");

const token=authorization.replace("Bearer ","");
const {data,error}=await supabase.auth.getUser(token);

if(error||!data?.user)throw new Error("Invalid or expired session.");

const {rows}=await pool.query(
`SELECT id,full_name,username,email,role,position,department,is_active
FROM users WHERE id=$1 LIMIT 1`,
[data.user.id]
);

const user=rows[0];

if(!user)throw new Error("Your staff profile was not found.");
if(!user.is_active)throw new Error("This account is inactive.");

return user;
}

function normaliseClassName(value){
return String(value||"").trim().toUpperCase();
}

function normaliseStatus(value){
const status=String(value||"ACTIVE").trim().toUpperCase();
return ["ACTIVE","INACTIVE","DISABLED"].includes(status)?"ACTIVE":status;
}

function isStudentActive(status){
return !["INACTIVE","DISABLED"].includes(String(status||"").toUpperCase());
}

/*
GET ALL STUDENTS
GET /api/students
*/

router.get("/",async(req,res)=>{
try{
await getAuthenticatedUser(req);

const className=req.query.class?normaliseClassName(req.query.class):null;
const search=String(req.query.search||"").trim();

if(className&&!ALLOWED_CLASSES.includes(className)){
return res.status(400).json({
success:false,
message:"Invalid class."
});
}

const {rows}=await pool.query(
`SELECT
id,
admission_number,
first_name,
last_name,
full_name,
gender,
date_of_birth,
class_name,
stream,
parent_name,
parent_phone,
status,
is_active,
created_at,
updated_at
FROM students
WHERE ($1::text IS NULL OR UPPER(TRIM(class_name))=$1)
AND (
$2::text=''
OR LOWER(COALESCE(first_name,'')) LIKE LOWER('%'||$2||'%')
OR LOWER(COALESCE(last_name,'')) LIKE LOWER('%'||$2||'%')
OR LOWER(COALESCE(full_name,'')) LIKE LOWER('%'||$2||'%')
OR LOWER(COALESCE(admission_number,'')) LIKE LOWER('%'||$2||'%')
)
ORDER BY
CASE UPPER(TRIM(class_name))
WHEN 'BABY' THEN 1
WHEN 'MIDDLE' THEN 2
WHEN 'TOP' THEN 3
WHEN 'P1' THEN 4
WHEN 'P2' THEN 5
WHEN 'P3' THEN 6
WHEN 'P4' THEN 7
WHEN 'P5' THEN 8
WHEN 'P6' THEN 9
WHEN 'P7' THEN 10
ELSE 99
END,
full_name ASC`,
[className,search]
);

return res.status(200).json({
success:true,
students:rows
});

}catch(error){
console.error("GET STUDENTS ERROR:",error.message);

return res.status(401).json({
success:false,
message:error.message||"Unable to load students."
});
}
});

/*
GET STUDENT BY ID
GET /api/students/:id
*/

router.get("/:id",async(req,res)=>{
try{
await getAuthenticatedUser(req);

const {rows}=await pool.query(
`SELECT
id,
admission_number,
first_name,
last_name,
full_name,
gender,
date_of_birth,
class_name,
stream,
parent_name,
parent_phone,
status,
is_active,
created_at,
updated_at
FROM students
WHERE id=$1
LIMIT 1`,
[req.params.id]
);

if(!rows.length){
return res.status(404).json({
success:false,
message:"Student was not found."
});
}

return res.status(200).json({
success:true,
student:rows[0]
});

}catch(error){
console.error("GET STUDENT ERROR:",error.message);

return res.status(400).json({
success:false,
message:error.message||"Unable to load student."
});
}
});

/*
CREATE STUDENT
POST /api/students
*/

router.post("/",async(req,res)=>{
try{
await getAuthenticatedUser(req);

const {
admission_number,
first_name,
last_name,
gender,
date_of_birth,
class_name,
stream,
parent_name,
parent_phone,
status
}=req.body||{};

if(!admission_number||!first_name||!last_name||!class_name){
return res.status(400).json({
success:false,
message:"Admission number, first name, last name and class are required."
});
}

const cleanClass=normaliseClassName(class_name);

if(!ALLOWED_CLASSES.includes(cleanClass)){
return res.status(400).json({
success:false,
message:"Invalid class."
});
}

const cleanStatus=String(status||"ACTIVE").trim().toUpperCase();
const active=isStudentActive(cleanStatus);
const cleanFirstName=String(first_name).trim();
const cleanLastName=String(last_name).trim();
const fullName=(cleanFirstName+" "+cleanLastName).trim();

const {rows}=await pool.query(
`INSERT INTO students(
admission_number,
first_name,
last_name,
full_name,
gender,
date_of_birth,
class_name,
stream,
parent_name,
parent_phone,
status,
is_active
)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
RETURNING
id,
admission_number,
first_name,
last_name,
full_name,
gender,
date_of_birth,
class_name,
stream,
parent_name,
parent_phone,
status,
is_active,
created_at,
updated_at`,
[
String(admission_number).trim(),
cleanFirstName,
cleanLastName,
fullName,
gender?String(gender).trim().toUpperCase():null,
date_of_birth||null,
cleanClass,
stream?String(stream).trim():null,
parent_name?String(parent_name).trim():null,
parent_phone?String(parent_phone).trim():null,
cleanStatus,
active
]
);

return res.status(201).json({
success:true,
message:"Student added successfully.",
student:rows[0]
});

}catch(error){
console.error("CREATE STUDENT ERROR:",error.message);

if(error.code==="23505"){
return res.status(409).json({
success:false,
message:"A student with this admission number already exists."
});
}

return res.status(400).json({
success:false,
message:error.message||"Unable to add student."
});
}
});

/*
UPDATE STUDENT
PATCH /api/students/:id
*/

router.patch("/:id",async(req,res)=>{
try{
await getAuthenticatedUser(req);

const {
admission_number,
first_name,
last_name,
gender,
date_of_birth,
class_name,
stream,
parent_name,
parent_phone,
status
}=req.body||{};

const existingResult=await pool.query(
`SELECT * FROM students WHERE id=$1 LIMIT 1`,
[req.params.id]
);

const existing=existingResult.rows[0];

if(!existing){
return res.status(404).json({
success:false,
message:"Student was not found."
});
}

const cleanFirstName=first_name!==undefined?String(first_name).trim():existing.first_name;
const cleanLastName=last_name!==undefined?String(last_name).trim():existing.last_name;
const fullName=(cleanFirstName+" "+cleanLastName).trim();

let cleanClass=existing.class_name;

if(class_name!==undefined){
cleanClass=normaliseClassName(class_name);

if(!ALLOWED_CLASSES.includes(cleanClass)){
return res.status(400).json({
success:false,
message:"Invalid class."
});
}
}

const cleanStatus=status!==undefined?
String(status).trim().toUpperCase():
existing.status;

const active=isStudentActive(cleanStatus);

const {rows}=await pool.query(
`UPDATE students
SET
admission_number=$1,
first_name=$2,
last_name=$3,
full_name=$4,
gender=$5,
date_of_birth=$6,
class_name=$7,
stream=$8,
parent_name=$9,
parent_phone=$10,
status=$11,
is_active=$12
WHERE id=$13
RETURNING *`,
[
admission_number!==undefined?String(admission_number).trim():existing.admission_number,
cleanFirstName,
cleanLastName,
fullName,
gender!==undefined?(gender?String(gender).trim().toUpperCase():null):existing.gender,
date_of_birth!==undefined?(date_of_birth||null):existing.date_of_birth,
cleanClass,
stream!==undefined?(stream?String(stream).trim():null):existing.stream,
parent_name!==undefined?(parent_name?String(parent_name).trim():null):existing.parent_name,
parent_phone!==undefined?(parent_phone?String(parent_phone).trim():null):existing.parent_phone,
cleanStatus,
active,
req.params.id
]
);

return res.status(200).json({
success:true,
message:"Student updated successfully.",
student:rows[0]
});

}catch(error){
console.error("UPDATE STUDENT ERROR:",error.message);

if(error.code==="23505"){
return res.status(409).json({
success:false,
message:"Another student already uses this admission number."
});
}

return res.status(400).json({
success:false,
message:error.message||"Unable to update student."
});
}
});

/*
DELETE STUDENT
DELETE /api/students/:id
*/

router.delete("/:id",async(req,res)=>{
try{
const user=await getAuthenticatedUser(req);

if(String(user.role||"").toUpperCase()!=="ADMIN"){
return res.status(403).json({
success:false,
message:"Only administrators can delete student records."
});
}

const {rows}=await pool.query(
`DELETE FROM students
WHERE id=$1
RETURNING id,full_name,admission_number`,
[req.params.id]
);

if(!rows.length){
return res.status(404).json({
success:false,
message:"Student was not found."
});
}

return res.status(200).json({
success:true,
message:"Student deleted successfully.",
student:rows[0]
});

}catch(error){
console.error("DELETE STUDENT ERROR:",error.message);

return res.status(400).json({
success:false,
message:error.message||"Unable to delete student."
});
}
});

module.exports=router;
