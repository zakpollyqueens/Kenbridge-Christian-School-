const express=require("express");
const supabase=require("../supabase");
const pool=require("../db");
const router=express.Router();

async function getUser(req){
 const authorization=req.headers.authorization;
 if(!authorization?.startsWith("Bearer ")){
  const e=new Error("Authorization token is required.");
  e.status=401;
  throw e;
 }
 const token=authorization.replace("Bearer ","");
 const{data,error}=await supabase.auth.getUser(token);
 if(error||!data?.user){
  const e=new Error("Invalid or expired session.");
  e.status=401;
  throw e;
 }
 const{rows}=await pool.query(
  `SELECT id,full_name,username,email,role,position,department,phone,is_active
   FROM users WHERE id=$1 LIMIT 1`,
  [data.user.id]
 );
 const user=rows[0];
 if(!user){
  const e=new Error("Your Kenbridge profile was not found.");
  e.status=403;
  throw e;
 }
 if(!user.is_active){
  const e=new Error("Your account is inactive.");
  e.status=403;
  throw e;
 }
 return user;
}

function isAdmin(user){
 return String(user.role||"").toUpperCase()==="ADMIN";
}

function isBoard(user){
 return String(user.role||"").toUpperCase()==="BOARD";
}
/* BOARD PASSWORD-ONLY LOGIN */

router.post("/login",async(req,res)=>{
  try{
    const password=String(req.body?.password||"");

    if(!password){
      return res.status(400).json({
        success:false,
        message:"Please enter the Board password."
      });
    }

    const email=String(
      process.env.BOARD_PORTAL_EMAIL||""
    ).trim().toLowerCase();

    if(!email||!process.env.BOARD_PORTAL_PASSWORD){
      console.error(
        "BOARD PORTAL AUTH ENVIRONMENT VARIABLES ARE NOT CONFIGURED."
      );

      return res.status(503).json({
        success:false,
        message:"Board portal authentication is not configured."
      });
    }

    const{data,error}=await supabase.auth.signInWithPassword({
      email,
      password
    });

    if(error||!data?.user||!data?.session){
      return res.status(401).json({
        success:false,
        message:"Incorrect Board password or access denied."
      });
    }

    const{rows}=await pool.query(
      `SELECT
        id,
        full_name,
        username,
        email,
        role,
        position,
        department,
        phone,
        is_active
       FROM users
       WHERE id=$1
       LIMIT 1`,
      [data.user.id]
    );

    const user=rows[0];

    if(!user){
      return res.status(403).json({
        success:false,
        message:"Board portal account is not configured correctly."
      });
    }

    const role=String(user.role||"").toUpperCase();

    if(!user.is_active){
      return res.status(403).json({
        success:false,
        message:"Board portal account is inactive."
      });
    }

    if(role!=="BOARD"&&role!=="ADMIN"){
      return res.status(403).json({
        success:false,
        message:"This account does not have Board access."
      });
    }

    return res.status(200).json({
      success:true,
      message:"Board login successful.",
      user,
      access_token:data.session.access_token,
      refresh_token:data.session.refresh_token,
      expires_at:data.session.expires_at
    });

  }catch(error){
    console.error(
      "BOARD PASSWORD LOGIN ERROR:",
      error.message
    );

    return res.status(500).json({
      success:false,
      message:"Unable to complete Board login."
    });
  }
});
/* BOARD PORTAL LOGIN */

router.post("/login",async(req,res)=>{
  try{
    const password=String(req.body?.password||"");
    if(!password)return res.status(400).json({success:false,message:"Please enter the Board password."});

    const email=String(process.env.BOARD_PORTAL_EMAIL||"").trim().toLowerCase();
    if(!email||!process.env.BOARD_PORTAL_PASSWORD)return res.status(503).json({success:false,message:"Board portal authentication is not configured."});

    const{data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error||!data?.user||!data?.session)return res.status(401).json({success:false,message:"Incorrect Board password or access denied."});

    const{rows}=await pool.query(`SELECT id,full_name,username,email,role,position,department,phone,is_active FROM users WHERE id=$1 LIMIT 1`,[data.user.id]);
    const user=rows[0],role=String(user?.role||"").toUpperCase();

    if(!user)return res.status(403).json({success:false,message:"Board portal account is not configured correctly."});
    if(!user.is_active)return res.status(403).json({success:false,message:"Board portal account is inactive."});
    if(!["BOARD","ADMIN"].includes(role))return res.status(403).json({success:false,message:"This account does not have Board access."});

    return res.status(200).json({success:true,message:"Board login successful.",user,access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at});
  }catch(error){
    console.error("BOARD PASSWORD LOGIN ERROR:",error.message);
    return res.status(500).json({success:false,message:"Unable to complete Board login."});
  }
});

/* VERIFY BOARD SESSION */

router.get("/session",async(req,res)=>{
  try{
    const token=req.headers.authorization?.replace("Bearer ","");
    if(!token||token===req.headers.authorization)return res.status(401).json({success:false,message:"Authorization token is required."});

    const{data,error}=await supabase.auth.getUser(token);
    if(error||!data?.user)return res.status(401).json({success:false,message:"Invalid or expired Board session."});

    const{rows}=await pool.query(`SELECT id,full_name,username,email,role,position,department,phone,is_active FROM users WHERE id=$1 LIMIT 1`,[data.user.id]);
    const user=rows[0],role=String(user?.role||"").toUpperCase();

    if(!user)return res.status(403).json({success:false,message:"Kenbridge profile was not found."});
    if(!user.is_active)return res.status(403).json({success:false,message:"This account is inactive."});
    if(!["BOARD","ADMIN"].includes(role))return res.status(403).json({success:false,message:"Board access is required."});

    return res.status(200).json({success:true,user,is_board:role==="BOARD",is_admin:role==="ADMIN"});
  }catch(error){
    console.error("BOARD SESSION ERROR:",error.message);
    return res.status(500).json({success:false,message:"Unable to verify Board session."});
  }
});

/* BOARD PORTAL LOGOUT */

router.post("/logout",async(req,res)=>{
  return res.status(200).json({success:true,message:"Board session ended."});
});
async function requireBoard(req,res){
 try{
  const user=await getUser(req);
  if(!isAdmin(user)&&!isBoard(user)){
   return res.status(403).json({
    success:false,
    message:"Board of Governors access is required."
   });
  }
  return user;
 }catch(error){
  res.status(error.status||500).json({
   success:false,
   message:error.message||"Unable to verify Board access."
  });
  return null;
 }
}

async function requireAdmin(req,res){
 try{
  const user=await getUser(req);
  if(!isAdmin(user)){
   return res.status(403).json({
    success:false,
    message:"Only administrators can perform this action."
   });
  }
  return user;
 }catch(error){
  res.status(error.status||500).json({
   success:false,
   message:error.message||"Unable to verify administrator authorization."
  });
  return null;
 }
}

/* BOARD ACCESS */
router.get("/me",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  let board=null;

  if(isBoard(user)){
   const{rows}=await pool.query(
    `SELECT bm.*,u.full_name,u.username,u.email,u.position,u.department,u.phone
     FROM board_members bm
     JOIN users u ON u.id=bm.user_id
     WHERE bm.user_id=$1
     LIMIT 1`,
    [user.id]
   );
   board=rows[0]||null;
  }

  return res.status(200).json({
   success:true,
   user,
   is_admin:isAdmin(user),
   is_board:isBoard(user),
   board_member:board
  });
 }catch(error){
  console.error("BOARD ME ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to load Board profile."
  });
 }
});

/* BOARD MEMBERS - ADMIN/BOARD READ */
router.get("/members",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{rows}=await pool.query(
   `SELECT
      bm.id,
      bm.user_id,
      bm.board_position,
      bm.appointment_date,
      bm.term_end_date,
      bm.bio,
      bm.is_active,
      bm.created_at,
      bm.updated_at,
      u.full_name,
      u.username,
      u.email,
      u.position,
      u.department,
      u.phone
    FROM board_members bm
    JOIN users u ON u.id=bm.user_id
    ORDER BY bm.is_active DESC,u.full_name ASC`
  );

  return res.status(200).json({
   success:true,
   members:rows
  });
 }catch(error){
  console.error("GET BOARD MEMBERS ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to retrieve Board members."
  });
 }
});

/* CREATE BOARD MEMBER */
router.post("/members",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{
   full_name,
   username,
   email,
   password,
   board_position,
   appointment_date,
   term_end_date,
   bio,
   phone,
   is_active
  }=req.body||{};

  if(!full_name||!username||!email||!password||!board_position){
   return res.status(400).json({
    success:false,
    message:"Full name, username, email, password and Board position are required."
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
  const cleanPosition=String(board_position).trim();

  const{rows:existing}=await pool.query(
   `SELECT id FROM users
    WHERE LOWER(email)=LOWER($1)
       OR LOWER(username)=LOWER($2)
    LIMIT 1`,
   [cleanEmail,cleanUsername]
  );

  if(existing.length){
   return res.status(409).json({
    success:false,
    message:"An account with this email or username already exists."
   });
  }

  let createdUserId=null;

  try{
   const{data,error}=await supabase.auth.admin.createUser({
    email:cleanEmail,
    password:String(password),
    email_confirm:true
   });

   if(error||!data?.user){
    return res.status(400).json({
     success:false,
     message:error?.message||"Board authentication account could not be created."
    });
   }

   createdUserId=data.user.id;

   const client=await pool.connect();

   try{
    await client.query("BEGIN");

    await client.query(
     `INSERT INTO users(
       id,full_name,username,email,role,position,department,
       phone,notes,password_hash,is_active,created_at,updated_at
      )
      VALUES($1,$2,$3,$4,'BOARD',$5,'Board of Governors',
             $6,NULL,NULL,$7,NOW(),NOW())`,
     [
      createdUserId,
      cleanName,
      cleanUsername,
      cleanEmail,
      cleanPosition,
      phone?String(phone).trim():null,
      is_active!==false
     ]
    );

    await client.query(
     `INSERT INTO board_members(
       user_id,board_position,appointment_date,term_end_date,bio,is_active
      )
      VALUES($1,$2,$3,$4,$5,$6)`,
     [
      createdUserId,
      cleanPosition,
      appointment_date||null,
      term_end_date||null,
      bio?String(bio).trim():null,
      is_active!==false
     ]
    );

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
    message:"Board member account created successfully.",
    member:{
     id:data.user.id,
     full_name:cleanName,
     username:cleanUsername,
     email:cleanEmail,
     role:"BOARD",
     board_position:cleanPosition,
     is_active:is_active!==false
    }
   });
  }catch(error){
   if(createdUserId){
    await pool.query(
     `DELETE FROM board_members WHERE user_id=$1`,
     [createdUserId]
    ).catch(()=>{});

    await pool.query(
     `DELETE FROM users WHERE id=$1`,
     [createdUserId]
    ).catch(()=>{});

    await supabase.auth.admin.deleteUser(createdUserId).catch(()=>{});
   }
   throw error;
  }
 }catch(error){
  console.error("CREATE BOARD MEMBER ERROR:",error.message);

  if(error.code==="23505"){
   return res.status(409).json({
    success:false,
    message:"That Board member account already exists."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to create Board member."
  });
 }
});

/* UPDATE BOARD MEMBER */
router.put("/members/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{
   full_name,
   username,
   email,
   board_position,
   appointment_date,
   term_end_date,
   bio,
   phone,
   is_active
  }=req.body||{};

  if(!full_name||!username||!email||!board_position){
   return res.status(400).json({
    success:false,
    message:"Full name, username, email and Board position are required."
   });
  }

  const cleanName=String(full_name).trim();
  const cleanUsername=String(username).trim();
  const cleanEmail=String(email).trim().toLowerCase();
  const cleanPosition=String(board_position).trim();

  const{rows:duplicate}=await pool.query(
   `SELECT id FROM users
    WHERE (LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($2))
      AND id<>$3
    LIMIT 1`,
   [cleanEmail,cleanUsername,req.params.id]
  );

  if(duplicate.length){
   return res.status(409).json({
    success:false,
    message:"Another account already uses that email or username."
   });
  }

  const client=await pool.connect();

  try{
   await client.query("BEGIN");

   const{rows}=await client.query(
    `UPDATE users
     SET full_name=$1,
         username=$2,
         email=$3,
         role='BOARD',
         position=$4,
         department='Board of Governors',
         phone=$5,
         is_active=$6,
         updated_at=NOW()
     WHERE id=$7
     RETURNING id,full_name,username,email,role,position,department,phone,is_active`,
    [
     cleanName,
     cleanUsername,
     cleanEmail,
     cleanPosition,
     phone?String(phone).trim():null,
     is_active!==false,
     req.params.id
    ]
   );

   if(!rows[0]){
    await client.query("ROLLBACK");
    return res.status(404).json({
     success:false,
     message:"Board member account was not found."
    });
   }

   await client.query(
    `UPDATE board_members
     SET board_position=$1,
         appointment_date=$2,
         term_end_date=$3,
         bio=$4,
         is_active=$5,
         updated_at=NOW()
     WHERE user_id=$6`,
    [
     cleanPosition,
     appointment_date||null,
     term_end_date||null,
     bio?String(bio).trim():null,
     is_active!==false,
     req.params.id
    ]
   );

   await client.query("COMMIT");

   return res.status(200).json({
    success:true,
    message:"Board member updated successfully.",
    member:rows[0]
   });
  }catch(error){
   await client.query("ROLLBACK");
   throw error;
  }finally{
   client.release();
  }
 }catch(error){
  console.error("UPDATE BOARD MEMBER ERROR:",error.message);

  if(error.code==="23505"){
   return res.status(409).json({
    success:false,
    message:"That username or email is already in use."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to update Board member."
  });
 }
});

/* BOARD MEMBER STATUS */
router.patch("/members/:id/status",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{is_active}=req.body||{};

  if(typeof is_active!=="boolean"){
   return res.status(400).json({
    success:false,
    message:"A valid account status is required."
   });
  }

  const{rows}=await pool.query(
   `UPDATE users
    SET is_active=$1,updated_at=NOW()
    WHERE id=$2 AND role='BOARD'
    RETURNING id,full_name,username,email,role,position,is_active`,
   [is_active,req.params.id]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board member account was not found."
   });
  }

  await pool.query(
   `UPDATE board_members
    SET is_active=$1,updated_at=NOW()
    WHERE user_id=$2`,
   [is_active,req.params.id]
  );

  return res.status(200).json({
   success:true,
   message:is_active
    ?"Board member enabled successfully."
    :"Board member disabled successfully.",
   member:rows[0]
  });
 }catch(error){
  console.error("BOARD MEMBER STATUS ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to update Board member status."
  });
 }
});

/* DELETE BOARD MEMBER */
router.delete("/members/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{rows}=await pool.query(
   `SELECT id,email FROM users
    WHERE id=$1 AND role='BOARD'
    LIMIT 1`,
   [req.params.id]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board member account was not found."
   });
  }

  await pool.query(
   `DELETE FROM board_members WHERE user_id=$1`,
   [req.params.id]
  );

  await pool.query(
   `DELETE FROM users WHERE id=$1`,
   [req.params.id]
  );

  const{error}=await supabase.auth.admin.deleteUser(req.params.id);

  if(error){
   console.error(
    "SUPABASE BOARD DELETE ERROR:",
    error.message
   );
  }

  return res.status(200).json({
   success:true,
   message:"Board member account deleted successfully."
  });
 }catch(error){
  console.error("DELETE BOARD MEMBER ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to delete Board member."
  });
 }
});

/* GET MEETINGS */
router.get("/meetings",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{rows}=await pool.query(
   `SELECT
      bm.*,
      u.full_name AS creator_name
    FROM board_meetings bm
    LEFT JOIN users u ON u.id=bm.created_by
    ORDER BY bm.meeting_date DESC,bm.start_time DESC`
  );

  return res.status(200).json({
   success:true,
   meetings:rows
  });
 }catch(error){
  console.error("GET BOARD MEETINGS ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to retrieve Board meetings."
  });
 }
});

/* GET ONE MEETING */
router.get("/meetings/:id",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{rows}=await pool.query(
   `SELECT bm.*,u.full_name AS creator_name
    FROM board_meetings bm
    LEFT JOIN users u ON u.id=bm.created_by
    WHERE bm.id=$1
    LIMIT 1`,
   [req.params.id]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board meeting was not found."
   });
  }

  const{rows:agenda}=await pool.query(
   `SELECT *
    FROM board_agenda_items
    WHERE meeting_id=$1
    ORDER BY item_number ASC`,
   [req.params.id]
  );

  return res.status(200).json({
   success:true,
   meeting:rows[0],
   agenda
  });
 }catch(error){
  console.error("GET BOARD MEETING ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to retrieve Board meeting."
  });
 }
});

/* CREATE MEETING */
router.post("/meetings",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{
   title,
   description,
   meeting_date,
   start_time,
   end_time,
   meeting_type,
   location,
   online_provider,
   meeting_url,
   meeting_id,
   passcode,
   status
  }=req.body||{};

  if(!title||!meeting_date||!start_time){
   return res.status(400).json({
    success:false,
    message:"Meeting title, date and start time are required."
   });
  }

  const type=String(
   meeting_type||"online"
  ).toLowerCase();

  if(!["online","physical","hybrid"].includes(type)){
   return res.status(400).json({
    success:false,
    message:"Invalid meeting type."
   });
  }

  const meetingStatus=String(
   status||"scheduled"
  ).toLowerCase();

  if(!["scheduled","in_progress","completed","cancelled"].includes(meetingStatus)){
   return res.status(400).json({
    success:false,
    message:"Invalid meeting status."
   });
  }

  const{rows}=await pool.query(
   `INSERT INTO board_meetings(
     title,description,meeting_date,start_time,end_time,
     meeting_type,location,online_provider,meeting_url,
     meeting_id,passcode,status,created_by,created_at,updated_at
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
    RETURNING *`,
   [
    String(title).trim(),
    description?String(description).trim():null,
    meeting_date,
    start_time,
    end_time||null,
    type,
    location?String(location).trim():null,
    online_provider?String(online_provider).trim():null,
    meeting_url?String(meeting_url).trim():null,
    meeting_id?String(meeting_id).trim():null,
    passcode?String(passcode).trim():null,
    meetingStatus,
    user.id
   ]
  );

  return res.status(201).json({
   success:true,
   message:"Board meeting created successfully.",
   meeting:rows[0]
  });
 }catch(error){
  console.error("CREATE BOARD MEETING ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to create Board meeting."
  });
 }
});

/* UPDATE MEETING */
router.put("/meetings/:id",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{
   title,
   description,
   meeting_date,
   start_time,
   end_time,
   meeting_type,
   location,
   online_provider,
   meeting_url,
   meeting_id,
   passcode,
   status
  }=req.body||{};

  if(!title||!meeting_date||!start_time){
   return res.status(400).json({
    success:false,
    message:"Meeting title, date and start time are required."
   });
  }

  const type=String(
   meeting_type||"online"
  ).toLowerCase();

  const meetingStatus=String(
   status||"scheduled"
  ).toLowerCase();

  if(!["online","physical","hybrid"].includes(type)){
   return res.status(400).json({
    success:false,
    message:"Invalid meeting type."
   });
  }

  if(!["scheduled","in_progress","completed","cancelled"].includes(meetingStatus)){
   return res.status(400).json({
    success:false,
    message:"Invalid meeting status."
   });
  }

  const{rows}=await pool.query(
   `UPDATE board_meetings
    SET title=$1,
        description=$2,
        meeting_date=$3,
        start_time=$4,
        end_time=$5,
        meeting_type=$6,
        location=$7,
        online_provider=$8,
        meeting_url=$9,
        meeting_id=$10,
        passcode=$11,
        status=$12,
        updated_at=NOW()
    WHERE id=$13
    RETURNING *`,
   [
    String(title).trim(),
    description?String(description).trim():null,
    meeting_date,
    start_time,
    end_time||null,
    type,
    location?String(location).trim():null,
    online_provider?String(online_provider).trim():null,
    meeting_url?String(meeting_url).trim():null,
    meeting_id?String(meeting_id).trim():null,
    passcode?String(passcode).trim():null,
    meetingStatus,
    req.params.id
   ]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board meeting was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Board meeting updated successfully.",
   meeting:rows[0]
  });
 }catch(error){
  console.error("UPDATE BOARD MEETING ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to update Board meeting."
  });
 }
});

/* DELETE MEETING */
router.delete("/meetings/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{rows}=await pool.query(
   `DELETE FROM board_meetings
    WHERE id=$1
    RETURNING id`,
   [req.params.id]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board meeting was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Board meeting deleted successfully."
  });
 }catch(error){
  console.error("DELETE BOARD MEETING ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to delete Board meeting."
  });
 }
});

/* AGENDA */
router.get("/meetings/:id/agenda",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{rows}=await pool.query(
   `SELECT *
    FROM board_agenda_items
    WHERE meeting_id=$1
    ORDER BY item_number ASC`,
   [req.params.id]
  );

  return res.status(200).json({
   success:true,
   agenda:rows
  });
 }catch(error){
  console.error("GET BOARD AGENDA ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to retrieve meeting agenda."
  });
 }
});

router.post("/meetings/:id/agenda",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{
   item_number,
   title,
   description,
   presenter,
   status
  }=req.body||{};

  if(!item_number||!title){
   return res.status(400).json({
    success:false,
    message:"Agenda item number and title are required."
   });
  }

  const agendaStatus=String(
   status||"pending"
  ).toLowerCase();

  if(!["pending","discussed","deferred","completed"].includes(agendaStatus)){
   return res.status(400).json({
    success:false,
    message:"Invalid agenda status."
   });
  }

  const{rows}=await pool.query(
   `INSERT INTO board_agenda_items(
     meeting_id,item_number,title,description,presenter,status,created_at,updated_at
    )
    VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())
    RETURNING *`,
   [
    req.params.id,
    Number(item_number),
    String(title).trim(),
    description?String(description).trim():null,
    presenter?String(presenter).trim():null,
    agendaStatus
   ]
  );

  return res.status(201).json({
   success:true,
   message:"Agenda item added successfully.",
   agenda_item:rows[0]
  });
 }catch(error){
  console.error("CREATE BOARD AGENDA ERROR:",error.message);

  if(error.code==="23505"){
   return res.status(409).json({
    success:false,
    message:"That agenda item number already exists for this meeting."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to add agenda item."
  });
 }
});

router.put("/agenda/:id",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{
   item_number,
   title,
   description,
   presenter,
   status
  }=req.body||{};

  if(!item_number||!title){
   return res.status(400).json({
    success:false,
    message:"Agenda item number and title are required."
   });
  }

  const agendaStatus=String(
   status||"pending"
  ).toLowerCase();

  if(!["pending","discussed","deferred","completed"].includes(agendaStatus)){
   return res.status(400).json({
    success:false,
    message:"Invalid agenda status."
   });
  }

  const{rows}=await pool.query(
   `UPDATE board_agenda_items
    SET item_number=$1,
        title=$2,
        description=$3,
        presenter=$4,
        status=$5,
        updated_at=NOW()
    WHERE id=$6
    RETURNING *`,
   [
    Number(item_number),
    String(title).trim(),
    description?String(description).trim():null,
    presenter?String(presenter).trim():null,
    agendaStatus,
    req.params.id
   ]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Agenda item was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Agenda item updated successfully.",
   agenda_item:rows[0]
  });
 }catch(error){
  console.error("UPDATE BOARD AGENDA ERROR:",error.message);

  if(error.code==="23505"){
   return res.status(409).json({
    success:false,
    message:"That agenda item number already exists for this meeting."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to update agenda item."
  });
 }
});

router.delete("/agenda/:id",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{rows}=await pool.query(
   `DELETE FROM board_agenda_items
    WHERE id=$1
    RETURNING id`,
   [req.params.id]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Agenda item was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Agenda item deleted successfully."
  });
 }catch(error){
  console.error("DELETE BOARD AGENDA ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to delete agenda item."
  });
 }
});

/* DOCUMENTS - BOARD READ */
router.get("/documents",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{rows}=await pool.query(
   `SELECT
      bd.*,
      u.full_name AS uploader_name,
      m.title AS meeting_title,
      m.meeting_date
    FROM board_documents bd
    LEFT JOIN users u ON u.id=bd.uploaded_by
    LEFT JOIN board_meetings m ON m.id=bd.meeting_id
    ORDER BY bd.created_at DESC`
  );

  return res.status(200).json({
   success:true,
   documents:rows
  });
 }catch(error){
  console.error("GET BOARD DOCUMENTS ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to retrieve Board documents."
  });
 }
});

/* CREATE BOARD DOCUMENT - ADMIN */
router.post("/documents",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{
   title,
   description,
   document_type,
   file_url,
   storage_path,
   meeting_id,
   is_confidential
  }=req.body||{};

  if(!title){
   return res.status(400).json({
    success:false,
    message:"Document title is required."
   });
  }

  const type=String(
   document_type||"document"
  ).toLowerCase();

  if(![
   "agenda",
   "minutes",
   "policy",
   "plan",
   "report",
   "resolution",
   "document",
   "other"
  ].includes(type)){
   return res.status(400).json({
    success:false,
    message:"Invalid document type."
   });
  }

  if(!file_url&&!storage_path){
   return res.status(400).json({
    success:false,
    message:"A file URL or storage path is required."
   });
  }

  const confidential=
   is_confidential===true||
   String(is_confidential).toLowerCase()==="true";

  const{rows}=await pool.query(
   `INSERT INTO board_documents(
     title,description,document_type,file_url,storage_path,
     meeting_id,uploaded_by,is_confidential,created_at
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    RETURNING *`,
   [
    String(title).trim(),
    description?String(description).trim():null,
    type,
    file_url?String(file_url).trim():null,
    storage_path?String(storage_path).trim():null,
    meeting_id||null,
    admin.id,
    confidential
   ]
  );

  return res.status(201).json({
   success:true,
   message:"Board document created successfully.",
   document:rows[0]
  });
 }catch(error){
  console.error("CREATE BOARD DOCUMENT ERROR:",error.message);

  if(error.code==="23503"){
   return res.status(400).json({
    success:false,
    message:"The selected meeting or account could not be found."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to create Board document."
  });
 }
});

/* UPDATE BOARD DOCUMENT - ADMIN */
router.put("/documents/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{
   title,
   description,
   document_type,
   file_url,
   storage_path,
   meeting_id,
   is_confidential
  }=req.body||{};

  if(!title){
   return res.status(400).json({
    success:false,
    message:"Document title is required."
   });
  }

  const type=String(
   document_type||"document"
  ).toLowerCase();

  if(![
   "agenda",
   "minutes",
   "policy",
   "plan",
   "report",
   "resolution",
   "document",
   "other"
  ].includes(type)){
   return res.status(400).json({
    success:false,
    message:"Invalid document type."
   });
  }

  if(!file_url&&!storage_path){
   return res.status(400).json({
    success:false,
    message:"A file URL or storage path is required."
   });
  }

  const confidential=
   is_confidential===true||
   String(is_confidential).toLowerCase()==="true";

  const{rows}=await pool.query(
   `UPDATE board_documents
    SET title=$1,
        description=$2,
        document_type=$3,
        file_url=$4,
        storage_path=$5,
        meeting_id=$6,
        is_confidential=$7
    WHERE id=$8
    RETURNING *`,
   [
    String(title).trim(),
    description?String(description).trim():null,
    type,
    file_url?String(file_url).trim():null,
    storage_path?String(storage_path).trim():null,
    meeting_id||null,
    confidential,
    req.params.id
   ]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board document was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Board document updated successfully.",
   document:rows[0]
  });
 }catch(error){
  console.error("UPDATE BOARD DOCUMENT ERROR:",error.message);

  if(error.code==="23503"){
   return res.status(400).json({
    success:false,
    message:"The selected meeting could not be found."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to update Board document."
  });
 }
});

/* DELETE BOARD DOCUMENT - ADMIN */
router.delete("/documents/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{rows}=await pool.query(
   `DELETE FROM board_documents
    WHERE id=$1
    RETURNING id,title`,
   [req.params.id]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board document was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Board document deleted successfully.",
   document:rows[0]
  });
 }catch(error){
  console.error("DELETE BOARD DOCUMENT ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to delete Board document."
  });
 }
});

/* RESOLUTIONS - BOARD/ADMIN READ */
router.get("/resolutions",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const{rows}=await pool.query(
   `SELECT
      br.*,
      u.full_name AS creator_name,
      m.title AS meeting_title,
      m.meeting_date
    FROM board_resolutions br
    LEFT JOIN users u ON u.id=br.created_by
    LEFT JOIN board_meetings m ON m.id=br.meeting_id
    ORDER BY br.created_at DESC`
  );

  return res.status(200).json({
   success:true,
   resolutions:rows
  });
 }catch(error){
  console.error("GET BOARD RESOLUTIONS ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to retrieve Board resolutions."
  });
 }
});

/* CREATE RESOLUTION - ADMIN */
router.post("/resolutions",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{
   meeting_id,
   resolution_number,
   title,
   description,
   decision,
   action_required,
   responsible_person,
   due_date,
   status
  }=req.body||{};

  if(!title||!description){
   return res.status(400).json({
    success:false,
    message:"Resolution title and description are required."
   });
  }

  const resolutionStatus=String(
   status||"open"
  ).toLowerCase();

  if(![
   "open",
   "in_progress",
   "completed",
   "cancelled"
  ].includes(resolutionStatus)){
   return res.status(400).json({
    success:false,
    message:"Invalid resolution status."
   });
  }

  const{rows}=await pool.query(
   `INSERT INTO board_resolutions(
     meeting_id,resolution_number,title,description,decision,
     action_required,responsible_person,due_date,status,
     created_by,created_at,updated_at
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
    RETURNING *`,
   [
    meeting_id||null,
    resolution_number?String(resolution_number).trim():null,
    String(title).trim(),
    String(description).trim(),
    decision?String(decision).trim():null,
    action_required?String(action_required).trim():null,
    responsible_person?String(responsible_person).trim():null,
    due_date||null,
    resolutionStatus,
    admin.id
   ]
  );

  return res.status(201).json({
   success:true,
   message:"Board resolution created successfully.",
   resolution:rows[0]
  });
 }catch(error){
  console.error("CREATE BOARD RESOLUTION ERROR:",error.message);

  if(error.code==="23503"){
   return res.status(400).json({
    success:false,
    message:"The selected meeting or account could not be found."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to create Board resolution."
  });
 }
});

/* UPDATE RESOLUTION - ADMIN */
router.put("/resolutions/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{
   meeting_id,
   resolution_number,
   title,
   description,
   decision,
   action_required,
   responsible_person,
   due_date,
   status
  }=req.body||{};

  if(!title||!description){
   return res.status(400).json({
    success:false,
    message:"Resolution title and description are required."
   });
  }

  const resolutionStatus=String(
   status||"open"
  ).toLowerCase();

  if(![
   "open",
   "in_progress",
   "completed",
   "cancelled"
  ].includes(resolutionStatus)){
   return res.status(400).json({
    success:false,
    message:"Invalid resolution status."
   });
  }

  const{rows}=await pool.query(
   `UPDATE board_resolutions
    SET meeting_id=$1,
        resolution_number=$2,
        title=$3,
        description=$4,
        decision=$5,
        action_required=$6,
        responsible_person=$7,
        due_date=$8,
        status=$9,
        updated_at=NOW()
    WHERE id=$10
    RETURNING *`,
   [
    meeting_id||null,
    resolution_number?String(resolution_number).trim():null,
    String(title).trim(),
    String(description).trim(),
    decision?String(decision).trim():null,
    action_required?String(action_required).trim():null,
    responsible_person?String(responsible_person).trim():null,
    due_date||null,
    resolutionStatus,
    req.params.id
   ]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board resolution was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Board resolution updated successfully.",
   resolution:rows[0]
  });
 }catch(error){
  console.error("UPDATE BOARD RESOLUTION ERROR:",error.message);

  if(error.code==="23503"){
   return res.status(400).json({
    success:false,
    message:"The selected meeting could not be found."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to update Board resolution."
  });
 }
});

/* DELETE RESOLUTION - ADMIN */
router.delete("/resolutions/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{rows}=await pool.query(
   `DELETE FROM board_resolutions
    WHERE id=$1
    RETURNING id,title,resolution_number`,
   [req.params.id]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board resolution was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Board resolution deleted successfully.",
   resolution:rows[0]
  });
 }catch(error){
  console.error("DELETE BOARD RESOLUTION ERROR:",error.message);

  if(error.code==="23503"){
   return res.status(400).json({
    success:false,
    message:"This resolution cannot be deleted because it is referenced by another record."
   });
  }

  return res.status(500).json({
   success:false,
   message:"Unable to delete Board resolution."
  });
 }
});

/* ANNOUNCEMENTS - BOARD/ADMIN READ */
router.get("/announcements",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const query=isAdmin(user)
   ?`SELECT
      ba.*,
      u.full_name AS creator_name
     FROM board_announcements ba
     LEFT JOIN users u ON u.id=ba.created_by
     ORDER BY
      CASE ba.priority
       WHEN 'urgent' THEN 1
       WHEN 'important' THEN 2
       ELSE 3
      END,
      ba.created_at DESC`
   :`SELECT
      ba.*,
      u.full_name AS creator_name
     FROM board_announcements ba
     LEFT JOIN users u ON u.id=ba.created_by
     WHERE ba.published=true
     ORDER BY
      CASE ba.priority
       WHEN 'urgent' THEN 1
       WHEN 'important' THEN 2
       ELSE 3
      END,
      ba.created_at DESC`;

  const{rows}=await pool.query(query);

  return res.status(200).json({
   success:true,
   announcements:rows
  });
 }catch(error){
  console.error("GET BOARD ANNOUNCEMENTS ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to retrieve Board announcements."
  });
 }
});

/* CREATE ANNOUNCEMENT - ADMIN */
router.post("/announcements",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{
   title,
   message,
   priority,
   published
  }=req.body||{};

  if(!title||!message){
   return res.status(400).json({
    success:false,
    message:"Announcement title and message are required."
   });
  }

  const announcementPriority=String(
   priority||"normal"
  ).toLowerCase();

  if(![
   "normal",
   "important",
   "urgent"
  ].includes(announcementPriority)){
   return res.status(400).json({
    success:false,
    message:"Invalid announcement priority."
   });
  }

  const{rows}=await pool.query(
   `INSERT INTO board_announcements(
     title,message,priority,published,created_by,created_at,updated_at
    )
    VALUES($1,$2,$3,$4,$5,NOW(),NOW())
    RETURNING *`,
   [
    String(title).trim(),
    String(message).trim(),
    announcementPriority,
    published!==false,
    admin.id
   ]
  );

  return res.status(201).json({
   success:true,
   message:"Board announcement created successfully.",
   announcement:rows[0]
  });
 }catch(error){
  console.error("CREATE BOARD ANNOUNCEMENT ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to create Board announcement."
  });
 }
});

/* UPDATE ANNOUNCEMENT - ADMIN */
router.put("/announcements/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{
   title,
   message,
   priority,
   published
  }=req.body||{};

  if(!title||!message){
   return res.status(400).json({
    success:false,
    message:"Announcement title and message are required."
   });
  }

  const announcementPriority=String(
   priority||"normal"
  ).toLowerCase();

  if(![
   "normal",
   "important",
   "urgent"
  ].includes(announcementPriority)){
   return res.status(400).json({
    success:false,
    message:"Invalid announcement priority."
   });
  }

  const{rows}=await pool.query(
   `UPDATE board_announcements
    SET title=$1,
        message=$2,
        priority=$3,
        published=$4,
        updated_at=NOW()
    WHERE id=$5
    RETURNING *`,
   [
    String(title).trim(),
    String(message).trim(),
    announcementPriority,
    published===true,
    req.params.id
   ]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board announcement was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Board announcement updated successfully.",
   announcement:rows[0]
  });
 }catch(error){
  console.error("UPDATE BOARD ANNOUNCEMENT ERROR:",error.message);

  return res.status(500).json({
   success:false,
   message:"Unable to update Board announcement."
  });
 }
});

/* DELETE ANNOUNCEMENT - ADMIN */
router.delete("/announcements/:id",async(req,res)=>{
 const admin=await requireAdmin(req,res);
 if(!admin)return;

 try{
  const{rows}=await pool.query(
   `DELETE FROM board_announcements
    WHERE id=$1
    RETURNING id,title`,
   [req.params.id]
  );

  if(!rows[0]){
   return res.status(404).json({
    success:false,
    message:"Board announcement was not found."
   });
  }

  return res.status(200).json({
   success:true,
   message:"Board announcement deleted successfully.",
   announcement:rows[0]
  });
 }catch(error){
  console.error("DELETE BOARD ANNOUNCEMENT ERROR:",error.message);

  return res.status(500).json({
   success:false,
   message:"Unable to delete Board announcement."
  });
 }
});

/* DASHBOARD SUMMARY */
router.get("/dashboard",async(req,res)=>{
 const user=await requireBoard(req,res);
 if(!user)return;

 try{
  const[
   meetings,
   members,
   resolutions,
   announcements,
   agenda
  ]=await Promise.all([
   pool.query(
    `SELECT COUNT(*)::int AS count
     FROM board_meetings
     WHERE status='scheduled'
       AND meeting_date>=CURRENT_DATE`
   ),
   pool.query(
    `SELECT COUNT(*)::int AS count
     FROM board_members
     WHERE is_active=true`
   ),
   pool.query(
    `SELECT COUNT(*)::int AS count
     FROM board_resolutions
     WHERE status IN ('open','in_progress')`
   ),
   pool.query(
    `SELECT COUNT(*)::int AS count
     FROM board_announcements
     WHERE published=true`
   ),
   pool.query(
    `SELECT COUNT(*)::int AS count
     FROM board_agenda_items
     WHERE status='pending'`
   )
  ]);

  const{rows:nextMeeting}=await pool.query(
   `SELECT *
    FROM board_meetings
    WHERE status='scheduled'
      AND meeting_date>=CURRENT_DATE
    ORDER BY meeting_date ASC,start_time ASC
    LIMIT 1`
  );

  return res.status(200).json({
   success:true,
   dashboard:{
    upcoming_meetings:meetings.rows[0].count,
    active_members:members.rows[0].count,
    open_resolutions:resolutions.rows[0].count,
    announcements:announcements.rows[0].count,
    pending_agenda_items:agenda.rows[0].count,
    next_meeting:nextMeeting[0]||null
   }
  });
 }catch(error){
  console.error("GET BOARD DASHBOARD ERROR:",error.message);
  return res.status(500).json({
   success:false,
   message:"Unable to load Board dashboard."
  });
 }
});

module.exports=router;
