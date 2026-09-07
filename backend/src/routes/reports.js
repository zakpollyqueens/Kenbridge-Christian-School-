const express=require("express");
const router=express.Router();
const pool=require("../db");
const supabase=require("../supabase");
const {v4:uuidv4}=require("uuid");

async function authenticateAdmin(req,res){
  try{
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
    if(!token){
      res.status(401).json({success:false,message:"Authorization token is required."});
      return null;
    }
    const {data,error}=await supabase.auth.getUser(token);
    if(error||!data?.user){
      res.status(401).json({success:false,message:"Invalid or expired staff session."});
      return null;
    }
    const user=data.user;
    const role=user.app_metadata?.role||user.user_metadata?.role||
      user.app_metadata?.user_role||user.user_metadata?.user_role||"";
    if(role&&String(role).toUpperCase()!=="ADMIN"&&
       !["TEACHER","STAFF","CLASS_TEACHER"].includes(String(role).toUpperCase())){
      res.status(403).json({success:false,message:"Staff access is required."});
      return null;
    }
    return user;
  }catch(error){
    console.error("REPORTS AUTH ERROR:",error);
    res.status(500).json({success:false,message:"Unable to authenticate staff session."});
    return null;
  }
}

function esc(v){
  return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function buildReportHtml({title,periodStart,periodEnd,rowsAgg}){
  const labels=rowsAgg.map(r=>r.name||"Unnamed");
  const avgData=rowsAgg.map(r=>Number(r.avg_percent||0));
  const passData=rowsAgg.map(r=>Number(r.pass_rate||0));
  const rows=rowsAgg.map(r=>`<tr><td>${esc(r.name)}</td><td>${Number(r.avg_percent||0).toFixed(2)}</td><td>${Number(r.pass_rate||0).toFixed(2)}%</td><td>${Number(r.attempts||0)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/css/style.css"><script src="https://cdn.jsdelivr.net/npm/chart.js"></script></head><body><div class="container"><h1>${esc(title)}</h1><p>Period: ${esc(periodStart)} — ${esc(periodEnd)}</p><section class="section"><h3>Summary Charts</h3><canvas id="avgChart"></canvas><canvas id="passChart"></canvas></section><section class="section"><h3>Details</h3><table class="report-table"><thead><tr><th>Subject</th><th>Avg %</th><th>Pass %</th><th>Attempts</th></tr></thead><tbody>${rows}</tbody></table></section></div><script>const labels=${JSON.stringify(labels)},avgData=${JSON.stringify(avgData)},passData=${JSON.stringify(passData)};new Chart(document.getElementById("avgChart"),{type:"bar",data:{labels,datasets:[{label:"Average (%)",data:avgData}]},options:{scales:{y:{beginAtZero:true,max:100}}}});new Chart(document.getElementById("passChart"),{type:"line",data:{labels,datasets:[{label:"Pass Rate (%)",data:passData,fill:true}]},options:{scales:{y:{beginAtZero:true,max:100}}}});</script></body></html>`;
}

/* CLASSES */
router.get("/classes",async(req,res)=>{
  try{
    if(!await authenticateAdmin(req,res))return;
    const {rows}=await pool.query(`
      SELECT DISTINCT TRIM(class_name) AS class_name
      FROM students
      WHERE class_name IS NOT NULL
        AND TRIM(class_name)<>''
        AND COALESCE(is_active,true)=true
      ORDER BY class_name ASC
    `);
    res.json({success:true,classes:rows});
  }catch(error){
    console.error("GET REPORT CLASSES ERROR:",error);
    res.status(500).json({success:false,message:"Unable to retrieve report classes.",error:error.message});
  }
});

/* LEARNERS FOR CLASS */
router.get("/classes/:className",async(req,res)=>{
  try{
    if(!await authenticateAdmin(req,res))return;

    const className=String(req.params.className||"").trim();
    const academicYear=String(req.query.academic_year||"").trim();
    const term=String(req.query.term||"").trim();

    if(!className)return res.status(400).json({success:false,message:"Class name is required."});
    if(!academicYear)return res.status(400).json({success:false,message:"Academic year is required."});
    if(!term)return res.status(400).json({success:false,message:"Term is required."});

    const {rows}=await pool.query(`
      SELECT
        s.id AS student_id,
        COALESCE(NULLIF(TRIM(s.full_name),''),TRIM(CONCAT_WS(' ',s.first_name,s.last_name))) AS full_name,
        s.class_name,
        COALESCE(sr.aggregate,0) AS aggregate,
        sr.overall_grade,
        sr.report_status,
        sr.id AS report_id,
        $2 AS academic_year,
        $3 AS term
      FROM students s
      LEFT JOIN student_reports sr
        ON sr.student_id=s.id
       AND UPPER(TRIM(sr.class_name))=UPPER(TRIM(s.class_name))
       AND TRIM(sr.academic_year)=TRIM($2)
       AND TRIM(sr.term)=TRIM($3)
      WHERE UPPER(TRIM(s.class_name))=UPPER(TRIM($1))
        AND COALESCE(s.is_active,true)=true
      ORDER BY full_name ASC
    `,[className,academicYear,term]);

    res.json({
      success:true,
      class_name:className,
      academic_year:academicYear,
      term,
      students:rows
    });
  }catch(error){
    console.error("GET CLASS REPORT STUDENTS ERROR:",error);
    res.status(500).json({
      success:false,
      message:"Unable to retrieve learners for this class.",
      error:error.message
    });
  }
});

/* GET ONE MANUAL REPORT */
router.get("/manual/:studentId",async(req,res)=>{
  try{
    if(!await authenticateAdmin(req,res))return;

    const {studentId}=req.params;
    const year=String(req.query.academic_year||"").trim();
    const term=String(req.query.term||"").trim();

    const {rows}=await pool.query(`
      SELECT
        sr.*,
        COALESCE(NULLIF(TRIM(s.full_name),''),TRIM(CONCAT_WS(' ',s.first_name,s.last_name))) AS full_name
      FROM student_reports sr
      JOIN students s ON s.id=sr.student_id
      WHERE sr.student_id=$1
        AND TRIM(sr.academic_year)=TRIM($2)
        AND TRIM(sr.term)=TRIM($3)
      LIMIT 1
    `,[studentId,year,term]);

    res.json({success:true,report:rows[0]||null});
  }catch(error){
    console.error("GET MANUAL REPORT ERROR:",error);
    res.status(500).json({success:false,message:"Unable to retrieve report.",error:error.message});
  }
});

/* CREATE / UPDATE MANUAL REPORT */
router.post("/manual",async(req,res)=>{
  try{
    const user=await authenticateAdmin(req,res);
    if(!user)return;

    const {
      student_id,
      class_name,
      academic_year,
      term,
      subject_marks={},
      subject_grades={},
      aggregate=null,
      overall_grade="",
      attendance_days=null,
      total_school_days=null,
      teacher_comment="",
      head_teacher_comment="",
      report_status="DRAFT"
    }=req.body||{};

    if(!student_id||!class_name||!academic_year||!term){
      return res.status(400).json({
        success:false,
        message:"Student, class, academic year and term are required."
      });
    }

    const student=await pool.query(
      "SELECT id,full_name,first_name,last_name,class_name FROM students WHERE id=$1 LIMIT 1",
      [student_id]
    );

    if(!student.rows.length){
      return res.status(404).json({success:false,message:"Student was not found."});
    }

    const existing=await pool.query(`
      SELECT id FROM student_reports
      WHERE student_id=$1
        AND TRIM(class_name)=TRIM($2)
        AND TRIM(academic_year)=TRIM($3)
        AND TRIM(term)=TRIM($4)
      LIMIT 1
    `,[student_id,class_name,academic_year,term]);

    const cleanMarks=subject_marks&&typeof subject_marks==="object"?subject_marks:{};
    const cleanGrades=subject_grades&&typeof subject_grades==="object"?subject_grades:{};

    if(existing.rows.length){
      const {rows}=await pool.query(`
        UPDATE student_reports SET
          teacher_id=$1,
          subject_marks=$2::jsonb,
          subject_grades=$3::jsonb,
          aggregate=$4,
          overall_grade=$5,
          attendance_days=$6,
          total_school_days=$7,
          teacher_comment=$8,
          head_teacher_comment=$9,
          report_status=$10,
          submitted_at=CASE WHEN $10 IN ('SUBMITTED','APPROVED') THEN NOW() ELSE submitted_at END
        WHERE id=$11
        RETURNING *
      `,[
        user.id,JSON.stringify(cleanMarks),JSON.stringify(cleanGrades),
        aggregate===""||aggregate==null?null:Number(aggregate),
        overall_grade||null,
        attendance_days===""||attendance_days==null?null:Number(attendance_days),
        total_school_days===""||total_school_days==null?null:Number(total_school_days),
        teacher_comment||null,head_teacher_comment||null,
        report_status||"DRAFT",existing.rows[0].id
      ]);

      return res.json({success:true,message:"Report updated successfully.",report:rows[0]});
    }

    const id=uuidv4();

    const {rows}=await pool.query(`
      INSERT INTO student_reports(
        id,student_id,teacher_id,class_name,academic_year,term,
        subject_marks,subject_grades,aggregate,overall_grade,
        attendance_days,total_school_days,teacher_comment,
        head_teacher_comment,report_status,submitted_at
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,
        $11,$12,$13,$14,$15,
        CASE WHEN $15 IN ('SUBMITTED','APPROVED') THEN NOW() ELSE NULL END
      )
      RETURNING *
    `,[
      id,student_id,user.id,class_name,academic_year,term,
      JSON.stringify(cleanMarks),JSON.stringify(cleanGrades),
      aggregate===""||aggregate==null?null:Number(aggregate),
      overall_grade||null,
      attendance_days===""||attendance_days==null?null:Number(attendance_days),
      total_school_days===""||total_school_days==null?null:Number(total_school_days),
      teacher_comment||null,head_teacher_comment||null,
      report_status||"DRAFT"
    ]);

    res.status(201).json({success:true,message:"Report created successfully.",report:rows[0]});
  }catch(error){
    console.error("SAVE MANUAL REPORT ERROR:",error);
    res.status(500).json({
      success:false,
      message:"Unable to save manual report.",
      error:error.message
    });
  }
});

/* GENERATED REPORTS */
router.post("/generate",async(req,res)=>{
  try{
    if(!await authenticateAdmin(req,res))return;

    const {periodType="CUSTOM",startDate,endDate,title}=req.body||{};
    if(!startDate||!endDate){
      return res.status(400).json({success:false,message:"startDate and endDate are required (YYYY-MM-DD)."});
    }

    const {rows}=await pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(subject_name),''),'Unnamed Subject') AS name,
        ROUND(AVG(COALESCE(marks,0))::numeric,2) AS avg_percent,
        COUNT(*)::integer AS attempts,
        ROUND(SUM(CASE WHEN COALESCE(marks,0)>=50 THEN 1 ELSE 0 END)*100.0/NULLIF(COUNT(*),0),2) AS pass_rate
      FROM results
      WHERE created_at::date BETWEEN $1::date AND $2::date
      GROUP BY COALESCE(NULLIF(TRIM(subject_name),''),'Unnamed Subject')
      ORDER BY avg_percent DESC
    `,[startDate,endDate]);

    const reportTitle=title||`Achievement Report (${periodType})`;
    const reportId=uuidv4();

    await pool.query(`
      INSERT INTO reports(
        id,title,period_type,period_start,period_end,
        generated_at,html_content,created_at,updated_at
      )
      VALUES($1,$2,$3,$4,$5,NOW(),$6,NOW(),NOW())
    `,[
      reportId,reportTitle,periodType,startDate,endDate,
      buildReportHtml({title:reportTitle,periodStart:startDate,periodEnd:endDate,rowsAgg:rows})
    ]);

    res.status(201).json({success:true,reportId,message:"Report generated successfully."});
  }catch(error){
    console.error("GENERATE REPORT ERROR:",error);
    res.status(500).json({success:false,message:"Unable to generate report.",error:error.message});
  }
});

router.get("/",async(req,res)=>{
  try{
    const {rows}=await pool.query(`
      SELECT id,title,student_id,class_name,term,academic_year,
        period_type,period_start,period_end,generated_at,created_at,updated_at,status
      FROM reports
      ORDER BY COALESCE(generated_at,created_at) DESC
      LIMIT 100
    `);
    res.json({success:true,reports:rows});
  }catch(error){
    console.error("LIST REPORTS ERROR:",error);
    res.status(500).json({success:false,message:"Unable to retrieve reports.",error:error.message});
  }
});

router.get("/:id",async(req,res)=>{
  try{
    const {rows}=await pool.query(
      "SELECT html_content FROM reports WHERE id=$1 LIMIT 1",
      [req.params.id]
    );
    if(!rows.length)return res.status(404).send("Report not found");
    if(!rows[0].html_content)return res.status(404).send("This report does not contain generated HTML.");
    res.status(200).set("Content-Type","text/html; charset=utf-8").send(rows[0].html_content);
  }catch(error){
    console.error("GET REPORT ERROR:",error);
    res.status(500).json({success:false,message:"Unable to retrieve the report.",error:error.message});
  }
});

module.exports=router;
