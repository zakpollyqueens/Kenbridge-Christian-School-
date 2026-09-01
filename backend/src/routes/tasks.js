const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

async function authenticateUser(req) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        throw new Error("Authorization token is required.");
    }

    const token = authorization.replace("Bearer ", "");

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
        throw new Error("Invalid or expired session.");
    }

    const { rows } = await pool.query(
        `SELECT
            id,
            full_name,
            username,
            email,
            role,
            is_active
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [data.user.id]
    );

    const user = rows[0];

    if (!user) {
        throw new Error("Staff profile was not found.");
    }

    if (!user.is_active) {
        throw new Error("This account is inactive.");
    }

    return user;
}

function isAdmin(user) {
    return String(user.role || "").toUpperCase() === "ADMIN";
}

/* =========================================================
   GET MY TASKS
   GET /api/tasks
========================================================= */

router.get("/", async (req, res) => {
    try {
        const user = await authenticateUser(req);

        const { rows } = await pool.query(
            `SELECT
                t.id,
                t.title,
                t.description,
                t.priority,
                t.status,
                t.due_date,
                t.created_at,
                t.updated_at,
                t.completed_at,
                t.assigned_to,
                t.created_by,
                assigned.full_name AS assigned_to_name,
                assigned.username AS assigned_to_username,
                creator.full_name AS created_by_name
             FROM staff_tasks t
             LEFT JOIN users assigned
                ON assigned.id = t.assigned_to
             LEFT JOIN users creator
                ON creator.id = t.created_by
             WHERE t.assigned_to = $1
                OR t.created_by = $1
             ORDER BY
                CASE t.status
                    WHEN 'IN_PROGRESS' THEN 1
                    WHEN 'PENDING' THEN 2
                    WHEN 'COMPLETED' THEN 3
                    WHEN 'CANCELLED' THEN 4
                    ELSE 5
                END,
                t.due_date ASC NULLS LAST,
                t.created_at DESC`,
            [user.id]
        );

        return res.status(200).json({
            success: true,
            tasks: rows
        });

    } catch (error) {
        console.error("GET TASKS ERROR:", error.message);

        return res.status(401).json({
            success: false,
            message: error.message || "Unable to retrieve tasks."
        });
    }
});

/* =========================================================
   GET ALL TASKS
   GET /api/tasks/all

   ADMIN ONLY
========================================================= */

router.get("/all", async (req, res) => {
    try {
        const user = await authenticateUser(req);

        if (!isAdmin(user)) {
            return res.status(403).json({
                success: false,
                message: "Only administrators can view all staff tasks."
            });
        }

        const { rows } = await pool.query(
            `SELECT
                t.id,
                t.title,
                t.description,
                t.priority,
                t.status,
                t.due_date,
                t.created_at,
                t.updated_at,
                t.completed_at,
                t.assigned_to,
                t.created_by,
                assigned.full_name AS assigned_to_name,
                assigned.username AS assigned_to_username,
                creator.full_name AS created_by_name
             FROM staff_tasks t
             LEFT JOIN users assigned
                ON assigned.id = t.assigned_to
             LEFT JOIN users creator
                ON creator.id = t.created_by
             ORDER BY t.created_at DESC`
        );

        return res.status(200).json({
            success: true,
            tasks: rows
        });

    } catch (error) {
        console.error("GET ALL TASKS ERROR:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message || "Unable to retrieve tasks."
        });
    }
});

/* =========================================================
   CREATE TASK
   POST /api/tasks
========================================================= */

router.post("/", async (req, res) => {
    try {
        const user = await authenticateUser(req);

        const {
            title,
            description,
            assigned_to,
            priority,
            due_date
        } = req.body || {};

        if (!title?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Task title is required."
            });
        }

        if (String(title).trim().length > 200) {
            return res.status(400).json({
                success: false,
                message: "Task title cannot exceed 200 characters."
            });
        }

        let assignedUserId = assigned_to || user.id;

        const { rows: assignedRows } = await pool.query(
            `SELECT id, role, is_active
             FROM users
             WHERE id = $1
             LIMIT 1`,
            [assignedUserId]
        );

        const assignedUser = assignedRows[0];

        if (!assignedUser) {
            return res.status(404).json({
                success: false,
                message: "Assigned staff member was not found."
            });
        }

        if (!assignedUser.is_active) {
            return res.status(400).json({
                success: false,
                message: "Tasks cannot be assigned to an inactive account."
            });
        }

        if (!isAdmin(user) && assignedUserId !== user.id) {
            return res.status(403).json({
                success: false,
                message: "Staff members can only create tasks for themselves."
            });
        }

        const allowedPriorities = [
            "LOW",
            "NORMAL",
            "HIGH",
            "URGENT"
        ];

        const cleanPriority =
            String(priority || "NORMAL").toUpperCase();

        if (!allowedPriorities.includes(cleanPriority)) {
            return res.status(400).json({
                success: false,
                message: "Invalid task priority."
            });
        }

        const { rows } = await pool.query(
            `INSERT INTO staff_tasks
                (
                    title,
                    description,
                    assigned_to,
                    created_by,
                    priority,
                    status,
                    due_date
                )
             VALUES
                ($1, $2, $3, $4, $5, 'PENDING', $6)
             RETURNING *`,
            [
                String(title).trim(),
                description?.trim() || null,
                assignedUserId,
                user.id,
                cleanPriority,
                due_date || null
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Task created successfully.",
            task: rows[0]
        });

    } catch (error) {
        console.error("CREATE TASK ERROR:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message || "Unable to create task."
        });
    }
});

/* =========================================================
   UPDATE TASK STATUS
   PATCH /api/tasks/:id/status
========================================================= */

router.patch("/:id/status", async (req, res) => {
    try {
        const user = await authenticateUser(req);

        const { status } = req.body || {};

        const allowedStatuses = [
            "PENDING",
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED"
        ];

        const cleanStatus =
            String(status || "").toUpperCase();

        if (!allowedStatuses.includes(cleanStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid task status."
            });
        }

        const { rows: taskRows } = await pool.query(
            `SELECT id, assigned_to, created_by
             FROM staff_tasks
             WHERE id = $1
             LIMIT 1`,
            [req.params.id]
        );

        const task = taskRows[0];

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task was not found."
            });
        }

        const allowed =
            isAdmin(user) ||
            task.assigned_to === user.id ||
            task.created_by === user.id;

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to update this task."
            });
        }

        const completedAt =
            cleanStatus === "COMPLETED"
                ? "NOW()"
                : "NULL";

        const { rows } = await pool.query(
            `UPDATE staff_tasks
             SET
                status = $1,
                completed_at = ${completedAt},
                updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [cleanStatus, req.params.id]
        );

        return res.status(200).json({
            success: true,
            message: "Task status updated successfully.",
            task: rows[0]
        });

    } catch (error) {
        console.error("UPDATE TASK STATUS ERROR:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message || "Unable to update task status."
        });
    }
});

/* =========================================================
   DELETE TASK
   DELETE /api/tasks/:id

   ADMIN OR TASK CREATOR
========================================================= */

router.delete("/:id", async (req, res) => {
    try {
        const user = await authenticateUser(req);

        const { rows } = await pool.query(
            `SELECT id, created_by
             FROM staff_tasks
             WHERE id = $1
             LIMIT 1`,
            [req.params.id]
        );

        const task = rows[0];

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task was not found."
            });
        }

        if (
            !isAdmin(user) &&
            task.created_by !== user.id
        ) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to delete this task."
            });
        }

        await pool.query(
            `DELETE FROM staff_tasks
             WHERE id = $1`,
            [req.params.id]
        );

        return res.status(200).json({
            success: true,
            message: "Task deleted successfully."
        });

    } catch (error) {
        console.error("DELETE TASK ERROR:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message || "Unable to delete task."
        });
    }
});

module.exports = router;
