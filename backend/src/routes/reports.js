const express=require("express");
const router=express.Router();
const pool=require("../db");
const {v4:uuidv4}=require("uuid");
const supabase=require("../supabase");

async function authenticateAdmin(req,res){
  try{
    const token=req.headers.authorization?.replace("Bearer ","");
    if(!token){
      res.status(401).json({success:false,message:"Authorization token is required."});
      return null;
    }

    const {data,error}=await supabase.auth.getUser(token);

    if(error||!data?.user){
      res.status(401).json({success:false,message:"Invalid or expired admin session."});
      return null;
    }

    const {rows}=await pool.query(
      "SELECT * FROM users WHERE id=$1 LIMIT 1",
      [data.user.id]
    );

    const user=rows[0];

    if(!user){
      res.status(403).json({
        success:false,
        message:"Administrator account was not found."
      });
      return null;
    }

    if(
      user.is_active===false||
      String(user.role||"").toUpperCase()!=="ADMIN"
    ){
      res.status(403).json({
        success:false,
        message:"Administrator access is required."
      });
      return null;
    }

    return user;

  }catch(error){

    console.error("REPORTS AUTH ERROR:",error.message);

    res.status(500).json({
      success:false,
      message:"Unable to authenticate administrator."
    });

    return null;
  }
}

function buildReportHtml({
  title,
  periodStart,
  periodEnd,
  rowsAgg
}){

  const labels=rowsAgg.map(
    row=>row.name||"Unnamed"
  );

  const avgData=rowsAgg.map(
    row=>row.avg_percent
      ?Number(row.avg_percent)
      :0
  );

  const passData=rowsAgg.map(
    row=>row.pass_rate
      ?Number(row.pass_rate)
      :0
  );

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/css/style.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>

<div class="container">

<h1>${title}</h1>

<p>
Period:
${periodStart}
—
${periodEnd}
</p>

<section class="section">

<h3>Summary Charts</h3>

<canvas
id="avgChart"
style="max-width:900px;margin-bottom:18px"
></canvas>

<canvas
id="passChart"
style="max-width:900px;margin-bottom:28px"
></canvas>

</section>

<section class="section">

<h3>Details</h3>

<table
class="report-table"
style="width:100%;border-collapse:collapse"
>

<thead>

<tr
style="text-align:left;background:#f3f6f4"
>

<th style="padding:10px;border:1px solid #e6eee8">
Competency
</th>

<th style="padding:10px;border:1px solid #e6eee8">
Avg %
</th>

<th style="padding:10px;border:1px solid #e6eee8">
Pass %
</th>

<th style="padding:10px;border:1px solid #e6eee8">
Attempts
</th>

</tr>

</thead>

<tbody>

${rowsAgg.map(row=>`

<tr>

<td style="padding:10px;border:1px solid #eef6f0">
${row.name}
</td>

<td style="padding:10px;border:1px solid #eef6f0">
${row.avg_percent?Number(row.avg_percent).toFixed(2):"N/A"}
</td>

<td style="padding:10px;border:1px solid #eef6f0">
${row.pass_rate||0}%
</td>

<td style="padding:10px;border:1px solid #eef6f0">
${row.attempts||0}
</td>

</tr>

`).join("")}

</tbody>

</table>

</section>

</div>

<script>

const labels=${JSON.stringify(labels)};
const avgData=${JSON.stringify(avgData)};
const passData=${JSON.stringify(passData)};

new Chart(
document.getElementById("avgChart"),
{
type:"bar",
data:{
labels,
datasets:[{
label:"Average (%)",
data:avgData,
backgroundColor:"rgba(8,120,63,0.85)"
}]
},
options:{
responsive:true,
scales:{
y:{
beginAtZero:true,
max:100
}
}
}
}
);

new Chart(
document.getElementById("passChart"),
{
type:"line",
data:{
labels,
datasets:[{
label:"Pass Rate (%)",
data:passData,
borderColor:"rgba(242,140,40,0.9)",
backgroundColor:"rgba(242,140,40,0.15)",
fill:true
}]
},
options:{
responsive:true,
scales:{
y:{
beginAtZero:true,
max:100
}
}
}
}
);

</script>

</body>
</html>`;
}


/* =====================================================
   GET AVAILABLE CLASSES
   GET /api/reports/classes
===================================================== */

router.get("/classes",async(req,res)=>{

  try{

    const admin=await authenticateAdmin(req,res);

    if(!admin)return;

    const {rows}=await pool.query(`
      SELECT DISTINCT
        UPPER(TRIM(class_name)) AS class_name
      FROM students
      WHERE class_name IS NOT NULL
        AND TRIM(class_name)<>''
      ORDER BY class_name ASC
    `);

    res.json({
      success:true,
      classes:rows
    });

  }catch(error){

    console.error(
      "GET REPORT CLASSES ERROR:",
      error.message
    );

    res.status(500).json({
      success:false,
      message:"Unable to retrieve report classes."
    });

  }

});


/* =====================================================
   GET STUDENTS AND REPORT STATUS FOR ONE CLASS

   GET /api/reports/classes/:className
===================================================== */

router.get("/classes/:className",async(req,res)=>{

  try{

    const admin=await authenticateAdmin(req,res);

    if(!admin)return;

    const className=
      String(req.params.className||"")
      .trim()
      .toUpperCase();

    const academicYear=
      String(req.query.academic_year||"")
      .trim();

    const term=
      String(req.query.term||"")
      .trim();

    if(!className){

      return res.status(400).json({
        success:false,
        message:"Class name is required."
      });

    }

    if(!academicYear){

      return res.status(400).json({
        success:false,
        message:"Academic year is required."
      });

    }

    if(!term){

      return res.status(400).json({
        success:false,
        message:"Term is required."
      });

    }


    /*
      Students are returned even when
      they do not yet have a report.
    */

    const {rows}=await pool.query(`
      SELECT
        s.id AS student_id,

        COALESCE(
          NULLIF(
            TRIM(
              CONCAT_WS(
                ' ',
                s.first_name,
                s.middle_name,
                s.last_name
              )
            ),
            ''
          ),
          s.full_name,
          'Unknown'
        ) AS full_name,

        s.class_name,

        $2 AS academic_year,

        $3 AS term,

        r.id AS report_id,

        COALESCE(
          r.aggregate,
          NULL
        ) AS aggregate,

        COALESCE(
          r.overall_grade,
          NULL
        ) AS overall_grade,

        COALESCE(
          r.status,
          'NOT_STARTED'
        ) AS report_status

      FROM students s

      LEFT JOIN reports r
        ON r.student_id=s.id
        AND CAST(r.academic_year AS TEXT)=$2
        AND r.term=$3

      WHERE
        UPPER(TRIM(s.class_name))=$1

        AND COALESCE(
          s.is_active,
          true
        )=true

      ORDER BY
        full_name ASC
    `,[
      className,
      academicYear,
      term
    ]);

    res.json({
      success:true,
      class_name:className,
      academic_year:academicYear,
      term,
      students:rows
    });

  }catch(error){

    console.error(
      "GET CLASS REPORT STUDENTS ERROR:",
      error.message
    );

    res.status(500).json({
      success:false,
      message:"Unable to retrieve learners for this class."
    });

  }

});


/* =====================================================
   GENERATE GENERAL ACHIEVEMENT REPORT
===================================================== */

router.post("/generate",async(req,res)=>{

  try{

    const admin=await authenticateAdmin(req,res);

    if(!admin)return;

    const {
      periodType="CUSTOM",
      startDate,
      endDate,
      title
    }=req.body||{};

    if(!startDate||!endDate){

      return res.status(400).json({
        success:false,
        message:"startDate and endDate are required (YYYY-MM-DD)."
      });

    }

    const {rows}=await pool.query(`
      SELECT
        c.id,
        c.name,

        AVG(
          (a.score/NULLIF(a.max_score,0))*100
        ) AS avg_percent,

        COUNT(*)::INT AS attempts,

        ROUND(
          SUM(
            CASE
              WHEN
                (a.score/NULLIF(a.max_score,0))*100>=50
              THEN 1
              ELSE 0
            END
          )*100.0/
          NULLIF(COUNT(*),0)::numeric,
          2
        ) AS pass_rate

      FROM assessments a

      JOIN competencies c
        ON c.id=a.competency_id

      WHERE
        a.assessment_date
        BETWEEN $1 AND $2

      GROUP BY
        c.id,
        c.name

      ORDER BY
        avg_percent DESC
    `,[
      startDate,
      endDate
    ]);

    const reportTitle=
      title||
      `Achievement Report (${periodType})`;

    const html=buildReportHtml({
      title:reportTitle,
      periodStart:startDate,
      periodEnd:endDate,
      rowsAgg:rows
    });

    const reportId=uuidv4();

    await pool.query(`
      INSERT INTO reports(
        id,
        period_type,
        period_start,
        period_end,
        generated_by,
        generated_at,
        title,
        html_content,
        summary_json
      )
      VALUES(
        $1,$2,$3,$4,$5,
        NOW(),
        $6,$7,$8
      )
    `,[
      reportId,
      periodType,
      startDate,
      endDate,
      admin.id,
      title||null,
      html,
      JSON.stringify({
        count:rows.length
      })
    ]);

    res.status(201).json({
      success:true,
      reportId
    });

  }catch(error){

    console.error(
      "GENERATE REPORT ERROR:",
      error.message
    );

    res.status(500).json({
      success:false,
      message:"Unable to generate report."
    });

  }

});


/* =====================================================
   LIST GENERATED REPORTS
===================================================== */

router.get("/",async(req,res)=>{

  try{

    const {rows}=await pool.query(`
      SELECT
        id,
        title,
        period_type,
        period_start,
        period_end,
        generated_at

      FROM reports

      ORDER BY
        generated_at DESC

      LIMIT 100
    `);

    res.json({
      success:true,
      reports:rows
    });

  }catch(error){

    console.error(
      "LIST REPORTS ERROR:",
      error.message
    );

    res.status(500).json({
      success:false,
      message:"Unable to retrieve reports."
    });

  }

});


/* =====================================================
   GET ONE GENERATED REPORT

   IMPORTANT:
   KEEP THIS LAST.
===================================================== */

router.get("/:id",async(req,res)=>{

  try{

    const {rows}=await pool.query(
      `
      SELECT html_content
      FROM reports
      WHERE id=$1
      LIMIT 1
      `,
      [req.params.id]
    );

    if(!rows.length){

      return res.status(404).send(
        "Report not found"
      );

    }

    res
    .set(
      "Content-Type",
      "text/html"
    )
    .send(
      rows[0].html_content
    );

  }catch(error){

    console.error(
      "GET REPORT ERROR:",
      error.message
    );

    res.status(500).json({
      success:false,
      message:"Unable to retrieve the report."
    });

  }

});


module.exports=router;
