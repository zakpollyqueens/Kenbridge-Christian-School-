const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");

const router=express.Router();

async function authenticateStaff(req,res){
    const authorization=req.headers.authorization;

    if(!authorization?.startsWith("Bearer ")){
        res.status(401).json({
            success:false,
            message:"Authorization token is required."
        });
        return null;
    }

    const token=authorization.replace("Bearer ","");

    const {data,error}=await supabase.auth.getUser(token);

    if(error||!data?.user){
        res.status(401).json({
            success:false,
            message:"Invalid or expired staff session."
        });
        return null;
    }

    const {rows}=await pool.query(
        `SELECT id,full_name,username,email,role,is_active
         FROM users
         WHERE id=$1
         LIMIT 1`,
        [data.user.id]
    );

    const user=rows[0];

    if(!user){
        res.status(403).json({
            success:false,
            message:"Staff account was not found."
        });
        return null;
    }

    if(!user.is_active){
        res.status(403).json({
            success:false,
            message:"This staff account is inactive."
        });
        return null;
    }

    const role=String(user.role||"").toUpperCase();

    if(role!=="STAFF"&&role!=="ADMIN"){
        res.status(403).json({
            success:false,
            message:"You do not have staff portal access."
        });
        return null;
    }

    return user;
}

function isAdmin(user){
    return String(user.role||"").toUpperCase()==="ADMIN";
}


/* ============================================================
   GET LEAVE REQUESTS
   STAFF: own requests
   ADMIN: all requests
   GET /api/leave
============================================================ */

router.get("/",async(req,res)=>{
    try{
        const user=await authenticateStaff(req,res);

        if(!user)return;

        let query;
        let values=[];

        if(isAdmin(user)){
            query=`
                SELECT
                    lr.id,
                    lr.user_id,
                    lr.leave_type,
                    lr.reason,
                    lr.start_date,
                    lr.end_date,
                    lr.details,
                    lr.status,
                    lr.reviewed_by,
                    lr.reviewed_at,
                    lr.review_comment,
                    lr.created_at,
                    lr.updated_at,
                    u.full_name AS staff_name,
                    u.username AS staff_username,
                    reviewer.full_name AS reviewer_name
                FROM leave_requests lr
                INNER JOIN users u
                    ON u.id=lr.user_id
                LEFT JOIN users reviewer
                    ON reviewer.id=lr.reviewed_by
                ORDER BY lr.created_at DESC
            `;
        }else{
            query=`
                SELECT
                    lr.id,
                    lr.user_id,
                    lr.leave_type,
                    lr.reason,
                    lr.start_date,
                    lr.end_date,
                    lr.details,
                    lr.status,
                    lr.reviewed_by,
                    lr.reviewed_at,
                    lr.review_comment,
                    lr.created_at,
                    lr.updated_at,
                    u.full_name AS staff_name,
                    u.username AS staff_username,
                    reviewer.full_name AS reviewer_name
                FROM leave_requests lr
                INNER JOIN users u
                    ON u.id=lr.user_id
                LEFT JOIN users reviewer
                    ON reviewer.id=lr.reviewed_by
                WHERE lr.user_id=$1
                ORDER BY lr.created_at DESC
            `;

            values=[user.id];
        }

        const {rows}=await pool.query(query,values);

        return res.status(200).json({
            success:true,
            requests:rows
        });

    }catch(error){

        console.error(
            "GET LEAVE REQUESTS ERROR:",
            error.message
        );

        return res.status(500).json({
            success:false,
            message:"Unable to retrieve leave requests."
        });
    }
});


/* ============================================================
   CREATE LEAVE REQUEST
   POST /api/leave
============================================================ */

router.post("/",async(req,res)=>{
    try{
        const user=await authenticateStaff(req,res);

        if(!user)return;

        const {
            leave_type,
            reason,
            start_date,
            end_date,
            details
        }=req.body||{};

        if(!leave_type?.trim()){
            return res.status(400).json({
                success:false,
                message:"Leave type is required."
            });
        }

        if(!reason?.trim()){
            return res.status(400).json({
                success:false,
                message:"Leave reason is required."
            });
        }

        if(!start_date||!end_date){
            return res.status(400).json({
                success:false,
                message:"Start date and end date are required."
            });
        }

        if(end_date<start_date){
            return res.status(400).json({
                success:false,
                message:"End date cannot be before the start date."
            });
        }

        const {rows}=await pool.query(
            `INSERT INTO leave_requests
                (
                    user_id,
                    leave_type,
                    reason,
                    start_date,
                    end_date,
                    details
                )
             VALUES
                ($1,$2,$3,$4,$5,$6)
             RETURNING *`,
            [
                user.id,
                String(leave_type).trim(),
                String(reason).trim(),
                start_date,
                end_date,
                details?.trim()||null
            ]
        );

        return res.status(201).json({
            success:true,
            message:"Leave request submitted successfully.",
            request:rows[0]
        });

    }catch(error){

        console.error(
            "CREATE LEAVE REQUEST ERROR:",
            error.message
        );

        return res.status(500).json({
            success:false,
            message:"Unable to submit leave request."
        });
    }
});


/* ============================================================
   UPDATE LEAVE REQUEST
   STAFF CAN UPDATE PENDING OWN REQUESTS
   PUT /api/leave/:id
============================================================ */

router.put("/:id",async(req,res)=>{
    try{
        const user=await authenticateStaff(req,res);

        if(!user)return;

        const {rows}=await pool.query(
            `SELECT *
             FROM leave_requests
             WHERE id=$1
             LIMIT 1`,
            [req.params.id]
        );

        const request=rows[0];

        if(!request){
            return res.status(404).json({
                success:false,
                message:"Leave request was not found."
            });
        }

        if(!isAdmin(user)&&request.user_id!==user.id){
            return res.status(403).json({
                success:false,
                message:"You do not have permission to edit this request."
            });
        }

        if(!isAdmin(user)&&request.status!=="PENDING"){
            return res.status(400).json({
                success:false,
                message:"Only pending leave requests can be edited."
            });
        }

        const {
            leave_type,
            reason,
            start_date,
            end_date,
            details
        }=req.body||{};

        if(!leave_type?.trim()||!reason?.trim()){
            return res.status(400).json({
                success:false,
                message:"Leave type and reason are required."
            });
        }

        if(!start_date||!end_date){
            return res.status(400).json({
                success:false,
                message:"Start date and end date are required."
            });
        }

        if(end_date<start_date){
            return res.status(400).json({
                success:false,
                message:"End date cannot be before the start date."
            });
        }

        const {rows:updated}=await pool.query(
            `UPDATE leave_requests
             SET
                leave_type=$1,
                reason=$2,
                start_date=$3,
                end_date=$4,
                details=$5,
                status='PENDING',
                reviewed_by=NULL,
                reviewed_at=NULL,
                review_comment=NULL,
                updated_at=NOW()
             WHERE id=$6
             RETURNING *`,
            [
                String(leave_type).trim(),
                String(reason).trim(),
                start_date,
                end_date,
                details?.trim()||null,
                req.params.id
            ]
        );

        return res.status(200).json({
            success:true,
            message:"Leave request updated successfully.",
            request:updated[0]
        });

    }catch(error){

        console.error(
            "UPDATE LEAVE REQUEST ERROR:",
            error.message
        );

        return res.status(500).json({
            success:false,
            message:"Unable to update leave request."
        });
    }
});


/* ============================================================
   APPROVE / REJECT LEAVE REQUEST
   ADMIN ONLY
   PATCH /api/leave/:id/status
============================================================ */

router.patch("/:id/status",async(req,res)=>{
    try{
        const user=await authenticateStaff(req,res);

        if(!user)return;

        if(!isAdmin(user)){
            return res.status(403).json({
                success:false,
                message:"Only administrators can approve or reject leave requests."
            });
        }

        const status=String(req.body?.status||"")
            .trim()
            .toUpperCase();

        const reviewComment=
            req.body?.review_comment?.trim()||null;

        if(!["APPROVED","REJECTED","PENDING"].includes(status)){
            return res.status(400).json({
                success:false,
                message:"Invalid leave request status."
            });
        }

        const {rows}=await pool.query(
            `UPDATE leave_requests
             SET
                status=$1,
                reviewed_by=$2,
                reviewed_at=NOW(),
                review_comment=$3,
                updated_at=NOW()
             WHERE id=$4
             RETURNING *`,
            [
                status,
                user.id,
                reviewComment,
                req.params.id
            ]
        );

        if(!rows.length){
            return res.status(404).json({
                success:false,
                message:"Leave request was not found."
            });
        }

        return res.status(200).json({
            success:true,
            message:`Leave request ${status.toLowerCase()} successfully.`,
            request:rows[0]
        });

    }catch(error){

        console.error(
            "UPDATE LEAVE STATUS ERROR:",
            error.message
        );

        return res.status(500).json({
            success:false,
            message:"Unable to update leave request status."
        });
    }
});


/* ============================================================
   DELETE LEAVE REQUEST
   STAFF: own pending requests
   ADMIN: any request
   DELETE /api/leave/:id
============================================================ */

router.delete("/:id",async(req,res)=>{
    try{
        const user=await authenticateStaff(req,res);

        if(!user)return;

        const {rows}=await pool.query(
            `SELECT id,user_id,status
             FROM leave_requests
             WHERE id=$1
             LIMIT 1`,
            [req.params.id]
        );

        const request=rows[0];

        if(!request){
            return res.status(404).json({
                success:false,
                message:"Leave request was not found."
            });
        }

        if(
            !isAdmin(user)&&
            (
                request.user_id!==user.id||
                request.status!=="PENDING"
            )
        ){
            return res.status(403).json({
                success:false,
                message:"You can only delete your own pending leave requests."
            });
        }

        await pool.query(
            `DELETE FROM leave_requests
             WHERE id=$1`,
            [req.params.id]
        );

        return res.status(200).json({
            success:true,
            message:"Leave request deleted successfully."
        });

    }catch(error){

        console.error(
            "DELETE LEAVE REQUEST ERROR:",
            error.message
        );

        return res.status(500).json({
            success:false,
            message:"Unable to delete leave request."
        });
    }
});


module.exports=router;
