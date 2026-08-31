const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

/*

SETUP INITIAL ADMINISTRATOR
POST /api/auth/setup-admin

*/

router.post("/setup-admin", async (req, res) => {

try {

const setupSecret =
  req.headers["x-setup-secret"];


if (
  setupSecret !== process.env.SETUP_SECRET
) {

  return res.status(403).json({
    success: false,
    message: "Unauthorized setup request."
  });

}


const {
  full_name,
  email,
  password
} = req.body || {};


if (
  !full_name ||
  !email ||
  !password
) {

  return res.status(400).json({
    success: false,
    message:
      "Full name, email and password are required."
  });

}


/*
CREATE ADMIN LOGIN ACCOUNT
IN SUPABASE
*/

const {
  data,
  error
} =
  await supabase.auth.admin.createUser({

    email:
      email
        .trim()
        .toLowerCase(),

    password:
      String(password),

    email_confirm:
      true

  });


if (
  error ||
  !data?.user
) {

  return res.status(400).json({
    success: false,
    message:
      error?.message ||
      "User creation failed."
  });

}


const user =
  data.user;


/*
CREATE ADMIN PROFILE
IN POSTGRESQL
*/

try {

  await pool.query(
    `
    INSERT INTO users
    (
      id,
      full_name,
      email,
      role,
      password_hash,
      is_active
    )
    VALUES
    (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6
    )
    `,
    [
      user.id,
      full_name.trim(),
      email.trim().toLowerCase(),
      "ADMIN",
      null,
      true
    ]
  );

}

catch (databaseError) {

  console.error(
    "DATABASE ADMIN PROFILE ERROR:",
    databaseError.message
  );


  await supabase.auth.admin
    .deleteUser(user.id)
    .catch(err =>
      console.error(
        "FAILED TO ROLLBACK SUPABASE USER:",
        err.message
      )
    );


  return res.status(500).json({
    success: false,
    message:
      "Administrator profile could not be created."
  });

}


return res.status(201).json({

  success:
    true,

  message:
    "Administrator account created successfully.",

  user: {

    id:
      user.id,

    full_name:
      full_name.trim(),

    email:
      email
        .trim()
        .toLowerCase(),

    role:
      "ADMIN"

  }

});

}

catch (error) {

console.error(
  "ADMIN SETUP ERROR:",
  error.message
);


return res.status(500).json({
  success: false,
  message:
    "Failed to create administrator account."
});

}

});

/*

CREATE STAFF ACCOUNT
POST /api/auth/create-staff
ADMIN ONLY

*/

router.post("/create-staff", async (req, res) => {

let createdUserId =
null;

try {

const authorization =
  req.headers.authorization;


/*
CHECK ADMIN TOKEN
*/

if (
  !authorization ||
  !authorization.startsWith("Bearer ")
) {

  return res.status(401).json({
    success: false,
    message:
      "Administrator authorization token is required."
  });

}


const token =
  authorization.replace(
    "Bearer ",
    ""
  );


/*
VERIFY TOKEN WITH SUPABASE
*/

const {
  data: authData,
  error: authError
} =
  await supabase.auth.getUser(
    token
  );


if (
  authError ||
  !authData?.user
) {

  return res.status(401).json({
    success: false,
    message:
      "Invalid or expired administrator session."
  });

}


/*
CHECK ADMIN PROFILE
*/

const adminResult =
  await pool.query(
    `
    SELECT
      id,
      role,
      is_active
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [
      authData.user.id
    ]
  );


const administrator =
  adminResult.rows[0];


if (!administrator) {

  return res.status(403).json({
    success: false,
    message:
      "Administrator profile was not found."
  });

}


if (
  !administrator.is_active
) {

  return res.status(403).json({
    success: false,
    message:
      "Your administrator account is inactive."
  });

}


if (
  String(
    administrator.role
  ).toUpperCase()
  !==
  "ADMIN"
) {

  return res.status(403).json({
    success: false,
    message:
      "Only administrators can create staff accounts."
  });

}


/*
GET STAFF DATA
*/

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

} =
  req.body || {};


/*
VALIDATE REQUIRED FIELDS
*/

if (

  !full_name ||
  !username ||
  !position ||
  !department ||
  !email ||
  !password

) {

  return res.status(400).json({
    success: false,
    message:
      "Required staff fields are missing."
  });

}


/*
CHECK PASSWORD
*/

if (
  String(password).length < 6
) {

  return res.status(400).json({
    success: false,
    message:
      "Password must contain at least 6 characters."
  });

}


/*
PREPARE DATA
*/

const normalizedEmail =
  String(email)
    .trim()
    .toLowerCase();


const normalizedUsername =
  String(username)
    .trim();


const normalizedPosition =
  String(position)
    .trim();


/*
PORTAL ROLE
*/

const portalRole =

  normalizedPosition
    .toLowerCase()
  ===
  "administrator"

    ?

    "ADMIN"

    :

    "STAFF";


/*
CREATE LOGIN ACCOUNT
IN SUPABASE
*/

const {

  data: createdAuthData,
  error: createAuthError

} =
  await supabase.auth.admin
    .createUser({

      email:
        normalizedEmail,

      password:
        String(password),

      email_confirm:
        true

    });


if (
  createAuthError ||
  !createdAuthData?.user
) {

  return res.status(400).json({

    success:
      false,

    message:
      createAuthError?.message ||
      "Staff authentication account could not be created."

  });

}


const createdUser =
  createdAuthData.user;


createdUserId =
  createdUser.id;


/*
SAVE STAFF PROFILE
IN POSTGRESQL
*/

try {

  await pool.query(
    `
    INSERT INTO users
    (
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
    VALUES
    (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      NOW(),
      NOW()
    )
    `,
    [

      createdUser.id,

      String(full_name)
        .trim(),

      normalizedUsername,

      normalizedEmail,

      portalRole,

      normalizedPosition,

      String(department)
        .trim(),

      phone
        ?
        String(phone).trim()
        :
        null,

      notes
        ?
        String(notes).trim()
        :
        null,

      null,

      is_active !== false

    ]
  );

}

catch (databaseError) {

  console.error(
    "DATABASE STAFF PROFILE ERROR:",
    databaseError.message
  );


  /*
  DELETE SUPABASE USER
  IF DATABASE SAVE FAILS
  */

  await supabase.auth.admin
    .deleteUser(
      createdUser.id
    )
    .catch(err =>
      console.error(
        "FAILED TO ROLLBACK STAFF AUTH ACCOUNT:",
        err.message
      )
    );


  return res.status(500).json({
    success: false,
    message:
      "Staff profile could not be saved."
  });

}


/*
SUCCESS
*/

return res.status(201).json({

  success:
    true,

  message:
    "Staff account created successfully.",

  user: {

    id:
      createdUser.id,

    full_name:
      String(full_name).trim(),

    username:
      normalizedUsername,

    position:
      normalizedPosition,

    department:
      String(department).trim(),

    email:
      normalizedEmail,

    phone:
      phone
        ?
        String(phone).trim()
        :
        null,

    role:
      portalRole,

    is_active:
      is_active !== false,

    notes:
      notes
        ?
        String(notes).trim()
        :
        null

  }

});

}

catch (error) {

console.error(
  "CREATE STAFF SERVER ERROR:",
  error.message
);


/*
ROLLBACK SUPABASE ACCOUNT
*/

if (createdUserId) {

  await supabase.auth.admin
    .deleteUser(
      createdUserId
    )
    .catch(err =>
      console.error(
        "ROLLBACK FAILED:",
        err.message
      )
    );

}


return res.status(500).json({
  success: false,
  message:
    "An unexpected error occurred while creating the staff account."
});

}

});

/*

GET STAFF ACCOUNTS
GET /api/auth/staff
ADMIN ONLY

*/

router.get("/staff", async (req, res) => {

try {

const authorization =
  req.headers.authorization;


/*
CHECK TOKEN
*/

if (
  !authorization ||
  !authorization.startsWith("Bearer ")
) {

  return res.status(401).json({
    success: false,
    message:
      "Administrator authorization token is required."
  });

}


const token =
  authorization.replace(
    "Bearer ",
    ""
  );


/*
VERIFY USER
*/

const {

  data: authData,
  error: authError

} =
  await supabase.auth.getUser(
    token
  );


if (
  authError ||
  !authData?.user
) {

  return res.status(401).json({
    success: false,
    message:
      "Invalid or expired administrator session."
  });

}


/*
CHECK ADMINISTRATOR
*/

const adminResult =
  await pool.query(
    `
    SELECT
      id,
      role,
      is_active
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [
      authData.user.id
    ]
  );


const administrator =
  adminResult.rows[0];


if (!administrator) {

  return res.status(403).json({
    success: false,
    message:
      "Administrator profile was not found."
  });

}


if (
  !administrator.is_active
) {

  return res.status(403).json({
    success: false,
    message:
      "Your administrator account is inactive."
  });

}


if (
  String(
    administrator.role
  ).toUpperCase()
  !==
  "ADMIN"
) {

  return res.status(403).json({
    success: false,
    message:
      "Only administrators can view staff accounts."
  });

}


/*
GET STAFF FROM POSTGRESQL
*/

const staffResult =
  await pool.query(
    `
    SELECT

      id,

      full_name,

      username,

      position,

      department,

      email,

      phone,

      role,

      is_active,

      notes,

      created_at,

      updated_at

    FROM users

    ORDER BY
      full_name ASC
    `
  );


/*
RETURN STAFF LIST
*/

return res.status(200).json({

  success:
    true,

  staff:
    staffResult.rows

});

}

catch (error) {

console.error(
  "GET STAFF ACCOUNTS ERROR:",
  error.message
);


return res.status(500).json({
  success: false,
  message:
    "Unable to retrieve staff accounts."
});

}

});

/*

LOGIN
POST /api/auth/login

*/

router.post("/login", async (req, res) => {

try {

const {
  email,
  password
} =
  req.body || {};


if (
  !email ||
  !password
) {

  return res.status(400).json({
    success: false,
    message:
      "Email and password are required."
  });

}


/*
LOGIN WITH SUPABASE
*/

const {
  data,
  error
} =
  await supabase.auth
    .signInWithPassword({

      email:
        email
          .trim()
          .toLowerCase(),

      password

    });


if (
  error ||
  !data?.user ||
  !data?.session
) {

  return res.status(401).json({
    success: false,
    message:
      "Invalid email or password."
  });

}


/*
GET PROFILE
*/

const {
  rows
} =
  await pool.query(
    `
    SELECT
      id,
      full_name,
      email,
      role,
      is_active
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [
      data.user.id
    ]
  );


const profile =
  rows[0];


if (!profile) {

  return res.status(403).json({
    success: false,
    message:
      "Account is not registered in the staff system."
  });

}


if (
  !profile.is_active
) {

  return res.status(403).json({
    success: false,
    message:
      "This account is inactive."
  });

}


/*
LOGIN SUCCESS
*/

return res.status(200).json({

  success:
    true,

  message:
    "Login successful.",

  user: {

    id:
      profile.id,

    full_name:
      profile.full_name,

    email:
      profile.email,

    role:
      profile.role

  },

  session: {

    access_token:
      data.session.access_token,

    refresh_token:
      data.session.refresh_token,

    expires_at:
      data.session.expires_at

  }

});

}

catch (error) {

console.error(
  "LOGIN SERVER ERROR:",
  error.message
);


return res.status(500).json({
  success: false,
  message:
    "An unexpected error occurred during login."
});

}

});

/*

CURRENT LOGGED-IN USER
GET /api/auth/me

*/

router.get("/me", async (req, res) => {

try {

const authorization =
  req.headers.authorization;


if (
  !authorization ||
  !authorization.startsWith("Bearer ")
) {

  return res.status(401).json({
    success: false,
    message:
      "Authorization token is required."
  });

}


const token =
  authorization.replace(
    "Bearer ",
    ""
  );


/*
VERIFY TOKEN
*/

const {
  data,
  error
} =
  await supabase.auth.getUser(
    token
  );


if (
  error ||
  !data?.user
) {

  return res.status(401).json({
    success: false,
    message:
      "Invalid or expired token."
  });

}


/*
GET PROFILE
*/

const {
  rows
} =
  await pool.query(
    `
    SELECT
      id,
      full_name,
      email,
      role,
      is_active
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [
      data.user.id
    ]
  );


const profile =
  rows[0];


if (!profile) {

  return res.status(403).json({
    success: false,
    message:
      "Authenticated account has no staff profile."
  });

}


if (
  !profile.is_active
) {

  return res.status(403).json({
    success: false,
    message:
      "This account is inactive."
  });

}


return res.status(200).json({

  success:
    true,

  user: {

    id:
      profile.id,

    full_name:
      profile.full_name,

    email:
      profile.email,

    role:
      profile.role

  }

});

}

catch (error) {

console.error(
  "AUTHENTICATION ERROR:",
  error.message
);


return res.status(500).json({
  success: false,
  message:
    "Authentication failed."
});

}

});

module.exports = router;
