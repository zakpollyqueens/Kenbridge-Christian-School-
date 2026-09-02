const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");
const router=express.Router();

async function authenticateUser(req){
const authorization=req.headers.authorization;
if(!authorization?.startsWith("Bearer "))throw new Error("Authorization token is required.");
const token=authorization.replace("Bearer ","");
const {data,error}=await supabase.auth.getUser(token);
if(error||!data?.user)throw new Error("Invalid or expired session.");
const {rows}=await pool.query(
`SELECT id,full_name,username,email,role,is_active
 FROM users WHERE id=$1 LIMIT 1`,
[data.user.id]
);
const user=rows[0];
if(!user)throw new Error("Staff profile was not found.");
if(!user.is_active)throw new Error("This account is inactive.");
return user;
}

function isAdmin(user){
return String(user.role||"").toUpperCase()==="ADMIN";
}

/* GET MY PAYROLL */
router.get("/my",async(req,res)=>{
try{
const user=await authenticateUser(req);
const {rows}=await pool.query(
`SELECT id,staff_id,pay_month,gross_amount,deductions,net_amount,status,created_at
 FROM payroll
 WHERE staff_id=$1
 ORDER BY pay_month DESC,created_at DESC`,
[user.id]
);
return res.status(200).json({
success:true,
payroll:rows
});
}catch(error){
console.error("GET MY PAYROLL ERROR:",error.message);
return res.status(401).json({
success:false,
message:error.message||"Unable to retrieve payroll records."
});
}
});

/* GET ALL PAYROLL - ADMIN ONLY */
router.get("/all",async(req,res)=>{
try{
const user=await authenticateUser(req);
if(!isAdmin(user)){
return res.status(403).json({
success:false,
message:"Only administrators can view all payroll records."
});
}
const {rows}=await pool.query(
`SELECT
p.id,p.staff_id,p.pay_month,p.gross_amount,p.deductions,
p.net_amount,p.status,p.created_at,
u.full_name AS staff_name,u.username AS staff_username,
u.email AS staff_email,u.position,u.department
FROM payroll p
LEFT JOIN users u ON u.id=p.staff_id
ORDER BY p.pay_month DESC,p.created_at DESC`
);
return res.status(200).json({
success:true,
payroll:rows
});
}catch(error){
console.error("GET ALL PAYROLL ERROR:",error.message);
return res.status(500).json({
success:false,
message:error.message||"Unable to retrieve payroll records."
});
}
});

/* CREATE PAYROLL - ADMIN ONLY */
router.post("/",async(req,res)=>{
try{
const user=await authenticateUser(req);
if(!isAdmin(user)){
return res.status(403).json({
success:false,
message:"Only administrators can create payroll records."
});
}

const {staff_id,pay_month,gross_amount,deductions,status}=req.body||{};

if(!staff_id)return res.status(400).json({success:false,message:"Staff member is required."});
if(!pay_month)return res.status(400).json({success:false,message:"Pay month is required."});

const gross=Number(gross_amount);
const deduction=Number(deductions||0);

if(!Number.isFinite(gross)||gross<0){
return res.status(400).json({success:false,message:"Gross amount must be a valid positive number."});
}

if(!Number.isFinite(deduction)||deduction<0){
return res.status(400).json({success:false,message:"Deductions must be a valid positive number."});
}

if(deduction>gross){
return res.status(400).json({success:false,message:"Deductions cannot exceed gross amount."});
}

const allowedStatuses=["PENDING","PROCESSING","PAID","CANCELLED"];
const cleanStatus=String(status||"PENDING").toUpperCase();

if(!allowedStatuses.includes(cleanStatus)){
return res.status(400).json({success:false,message:"Invalid payroll status."});
}

const {rows:staffRows}=await pool.query(
`SELECT id,is_active FROM users WHERE id=$1 LIMIT 1`,
[staff_id]
);

if(!staffRows.length){
return res.status(404).json({success:false,message:"Staff member was not found."});
}

if(!staffRows[0].is_active){
return res.status(400).json({success:false,message:"Cannot create payroll for an inactive staff member."});
}

const net=gross-deduction;

const {rows}=await pool.query(
`INSERT INTO payroll
(staff_id,pay_month,gross_amount,deductions,net_amount,status)
VALUES($1,$2,$3,$4,$5,$6)
RETURNING *`,
[staff_id,pay_month,gross,deduction,net,cleanStatus]
);

return res.status(201).json({
success:true,
message:"Payroll record created successfully.",
payroll:rows[0]
});

}catch(error){
console.error("CREATE PAYROLL ERROR:",error.message);
return res.status(500).json({
success:false,
message:error.message||"Unable to create payroll record."
});
}
});

/* UPDATE PAYROLL - ADMIN ONLY */
router.patch("/:id",async(req,res)=>{
try{
const user=await authenticateUser(req);

if(!isAdmin(user)){
return res.status(403).json({
success:false,
message:"Only administrators can update payroll records."
});
}

const {pay_month,gross_amount,deductions,status}=req.body||{};

const {rows:existingRows}=await pool.query(
`SELECT * FROM payroll WHERE id=$1 LIMIT 1`,
[req.params.id]
);

const existing=existingRows[0];

if(!existing){
return res.status(404).json({
success:false,
message:"Payroll record was not found."
});
}

const gross=gross_amount!==undefined?Number(gross_amount):Number(existing.gross_amount);
const deduction=deductions!==undefined?Number(deductions):Number(existing.deductions);

if(!Number.isFinite(gross)||gross<0){
return res.status(400).json({success:false,message:"Gross amount must be valid."});
}

if(!Number.isFinite(deduction)||deduction<0||deduction>gross){
return res.status(400).json({success:false,message:"Invalid deductions amount."});
}

const allowedStatuses=["PENDING","PROCESSING","PAID","CANCELLED"];
const cleanStatus=String(status||existing.status).toUpperCase();

if(!allowedStatuses.includes(cleanStatus)){
return res.status(400).json({success:false,message:"Invalid payroll status."});
}

const net=gross-deduction;

const {rows}=await pool.query(
`UPDATE payroll
SET pay_month=$1,gross_amount=$2,deductions=$3,
net_amount=$4,status=$5
WHERE id=$6
RETURNING *`,
[
pay_month||existing.pay_month,
gross,
deduction,
net,
cleanStatus,
req.params.id
]
);

return res.status(200).json({
success:true,
message:"Payroll record updated successfully.",
payroll:rows[0]
});

}catch(error){
console.error("UPDATE PAYROLL ERROR:",error.message);
return res.status(500).json({
success:false,
message:error.message||"Unable to update payroll record."
});
}
});

module.exports=router;
