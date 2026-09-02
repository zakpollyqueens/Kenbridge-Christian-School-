const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

const ALLOWED_CLASSES=[
"BABY",
"MIDDLE",
"TOP",
"P1",
"P2",
"P3",
"P4",
"P5",
"P6",
"P7"
];

const ALLOWED_STATUSES=[
"PRESENT",
"ABSENT",
"LATE"
];

async function getAuthenticatedUser(req){
const authorization=req.headers.authorization;

if(!authorization?.startsWith("Bearer ")){
throw new Error("Authorization token is required.");
}

const token=authorization.replace("Bearer ","");

const {data,error}=await supabase.auth.getUser(token);

if(error||!data?.user){
throw new Error("Invalid or expired session.");
}

const {rows}=await pool.query(
`SELECT
id,
full_name,
username,
email,
role,
position,
department,
is_active
FROM users
WHERE id=$1
LIMIT 1`,
[data.user.id]
);

const user=rows[0];

if(!user){
throw new Error("Your staff profile was not found.");
}

if(!user.is_active){
throw new Error("This account is inactive.");
}

const role=String(user.role||"").toUpperCase();

if(role!=="ADMIN"&&role!=="STAFF"){
throw new Error("Your account does not have permission to access attendance records.");
}

return user;
}

function normaliseClassName(value){
return String(value||"").trim().toUpperCase();
}

function normaliseStatus(value){
return String(value||"").trim().toUpperCase();
}

function validDate(value){
return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));
}

/* =================================
GET STUDENTS + ATTENDANCE FOR A DAY
================================= */

router.get("/",async(req,res)=>{
try{

await getAuthenticatedUser(req);

const className=normaliseClassName(req.query.class);
const attendanceDate=String(req.query.date||"").trim();

if(!ALLOWED_CLASSES.includes(className)){
return res.status(400).json({
success:false,
message:"Please select a valid class."
});
}

if(!validDate(attendanceDate)){
return res.status(400).json({
success:false,
message:"Please select a valid attendance date."
});
}

const {rows}=await pool.query(
`SELECT
s.id,
s.admission_number,
s.first_name,
s.last_name,
s.full_name,
s.class_name,
s.stream,
COALESCE(a.status,'') AS attendance_status,
a.id AS attendance_id,
a.recorded_by,
a.created_at AS attendance_created_at
FROM students s
LEFT JOIN attendance a
ON a.student_id=s.id
AND a.attendance_date=$2
WHERE
UPPER(TRIM(s.class_name))=$1
AND s.is_active=true
ORDER BY
COALESCE(s.full_name,TRIM(COALESCE(s.first_name,'')||' '||COALESCE(s.last_name,''))) ASC`,
[className,attendanceDate]
);

return res.status(200).json({
success:true,
class_name:className,
attendance_date:attendanceDate,
students:rows
});

}catch(error){

console.error("GET ATTENDANCE ERROR:",error.message);

return res.status(401).json({
success:false,
message:error.message||"Unable to load attendance."
});

}
});


/* =================================
SAVE ATTENDANCE
================================= */

router.post("/",async(req,res)=>{
try{

const user=await getAuthenticatedUser(req);

const {
class_name,
attendance_date,
attendance
}=req.body||{};

const cleanClass=normaliseClassName(class_name);
const cleanDate=String(attendance_date||"").trim();

if(!ALLOWED_CLASSES.includes(cleanClass)){
return res.status(400).json({
success:false,
message:"Please select a valid class."
});
}

if(!validDate(cleanDate)){
return res.status(400).json({
success:false,
message:"Please select a valid attendance date."
});
}

if(!Array.isArray(attendance)||attendance.length===0){
return res.status(400).json({
success:false,
message:"No attendance records were provided."
});
}

const uniqueStudentIds=new Set();

for(const record of attendance){

if(!record?.student_id){
return res.status(400).json({
success:false,
message:"Every attendance record must have a student."
});
}

if(uniqueStudentIds.has(record.student_id)){
return res.status(400).json({
success:false,
message:"A student cannot appear more than once."
});
}

uniqueStudentIds.add(record.student_id);

const status=normaliseStatus(record.status);

if(!ALLOWED_STATUSES.includes(status)){
return res.status(400).json({
success:false,
message:"Attendance status must be Present, Absent or Late."
});
}

}

const client=await pool.connect();

try{

await client.query("BEGIN");

const studentIds=attendance.map(record=>record.student_id);

const studentsResult=await client.query(
`SELECT id
FROM students
WHERE id=ANY($1::uuid[])
AND UPPER(TRIM(class_name))=$2
AND is_active=true`,
[studentIds,cleanClass]
);

if(studentsResult.rows.length!==studentIds.length){

throw new Error(
"One or more students do not belong to the selected active class."
);

}

const saved=[];

for(const record of attendance){

const status=normaliseStatus(record.status);

const result=await client.query(
`INSERT INTO attendance(
student_id,
attendance_date,
status,
recorded_by
)
VALUES($1,$2,$3,$4)
ON CONFLICT(student_id,attendance_date)
DO UPDATE SET
status=EXCLUDED.status,
recorded_by=EXCLUDED.recorded_by
RETURNING
id,
student_id,
attendance_date,
status,
recorded_by,
created_at`,
[
record.student_id,
cleanDate,
status,
user.id
]
);

saved.push(result.rows[0]);

}

await client.query("COMMIT");

return res.status(200).json({
success:true,
message:"Attendance saved successfully.",
attendance:saved
});

}catch(error){

await client.query("ROLLBACK");
throw error;

}finally{

client.release();

}

}catch(error){

console.error("SAVE ATTENDANCE ERROR:",error.message);

return res.status(400).json({
success:false,
message:error.message||"Unable to save attendance."
});

}
});


/* =================================
ATTENDANCE HISTORY
================================= */

router.get("/history",async(req,res)=>{
try{

await getAuthenticatedUser(req);

const className=req.query.class
?normaliseClassName(req.query.class)
:null;

const limit=Math.min(
Math.max(parseInt(req.query.limit,10)||30,1),
100
);

if(className&&!ALLOWED_CLASSES.includes(className)){
return res.status(400).json({
success:false,
message:"Invalid class."
});
}

const {rows}=await pool.query(
`SELECT
a.attendance_date,
s.class_name,
COUNT(*) FILTER(
WHERE UPPER(a.status)='PRESENT'
) AS present_count,
COUNT(*) FILTER(
WHERE UPPER(a.status)='ABSENT'
) AS absent_count,
COUNT(*) FILTER(
WHERE UPPER(a.status)='LATE'
) AS late_count,
COUNT(*) AS total_count
FROM attendance a
JOIN students s
ON s.id=a.student_id
WHERE
($1::text IS NULL OR UPPER(TRIM(s.class_name))=$1)
GROUP BY
a.attendance_date,
s.class_name
ORDER BY
a.attendance_date DESC,
s.class_name ASC
LIMIT $2`,
[className,limit]
);

return res.status(200).json({
success:true,
history:rows
});

}catch(error){

console.error("GET ATTENDANCE HISTORY ERROR:",error.message);

return res.status(401).json({
success:false,
message:error.message||"Unable to load attendance history."
});

}
});

module.exports=router;
