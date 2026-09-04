const pool=require("../db");

async function notifyStaff({
  userId,
  title,
  message,
  type="GENERAL"
}){
  if(!userId||!title||!message)return null;

  try{
    const {rows}=await pool.query(
      `INSERT INTO staff_notifications
       (user_id,title,message,notification_type,is_read,created_at)
       VALUES($1,$2,$3,$4,false,NOW())
       RETURNING
         id,
         user_id,
         title,
         message,
         notification_type,
         is_read,
         created_at`,
      [
        userId,
        title,
        message,
        String(type).toUpperCase()
      ]
    );

    return rows[0]||null;
  }catch(error){
    console.error(
      "CREATE STAFF NOTIFICATION ERROR:",
      error.message
    );
    return null;
  }
}

async function notifyStaffMany({
  userIds=[],
  title,
  message,
  type="GENERAL"
}){
  const ids=[...new Set(
    (Array.isArray(userIds)?userIds:[])
      .filter(Boolean)
  )];

  if(!ids.length)return [];

  const notifications=[];

  for(const userId of ids){
    const notification=await notifyStaff({
      userId,
      title,
      message,
      type
    });

    if(notification){
      notifications.push(notification);
    }
  }

  return notifications;
}

async function notifyAllStaff({
  title,
  message,
  type="GENERAL"
}){
  try{
    const {rows}=await pool.query(
      `SELECT id
       FROM users
       WHERE role IN('STAFF','ADMIN')
         AND is_active=true`
    );

    return await notifyStaffMany({
      userIds:rows.map(row=>row.id),
      title,
      message,
      type
    });
  }catch(error){
    console.error(
      "NOTIFY ALL STAFF ERROR:",
      error.message
    );
    return [];
  }
}

module.exports={
  notifyStaff,
  notifyStaffMany,
  notifyAllStaff
};
