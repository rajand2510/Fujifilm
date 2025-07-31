const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");
const http = require("http");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const imapSimple = require("imap-simple");
const mysql = require("mysql2/promise");
const XLSX = require("xlsx");
const dotenv = require("dotenv");
const cron = require("node-cron");

dotenv.config();

console.log("Starting server.js...");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5174", // Replace with your frontend URL
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Serve the documents folder statically
app.use("/documents", express.static(path.join(__dirname, "documents")));

// Define directories
const DOCUMENTS_DIR = path.join(__dirname, "documents");

// Database configuration
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "root",
  database: "companydata",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
};

let db;

const initDb = async () => {
  try {
    db = await mysql.createPool(dbConfig);
    console.log("Connected to MySQL database...");

    await db.query(`
      CREATE TABLE IF NOT EXISTS companies (
        _id VARCHAR(255) PRIMARY KEY,
        srno VARCHAR(255),
        companyName VARCHAR(255),
        username VARCHAR(255),
        groupName VARCHAR(255),
        division VARCHAR(255),
        status VARCHAR(255) DEFAULT 'Pending',
        email VARCHAR(255),
        phoneNumber VARCHAR(255),
        ownerEmail VARCHAR(255),
        documents TEXT,
        emailCount INT DEFAULT 0,
        emailSentDate DATETIME,
        formSentTimestamp VARCHAR(255),
        lastUpdated VARCHAR(255),
        documentSubmitted BOOLEAN DEFAULT FALSE,
        documentPath VARCHAR(255),
        lastEmailSent DATETIME,
        emailStatus VARCHAR(255) DEFAULT 'Pending',
        emailError TEXT,
        reminderSent VARCHAR(255),
        linkCreatedAt TIMESTAMP,
        sentEmails TEXT,
        receivedEmails TEXT,
        invoiceNo VARCHAR(255),
        invoiceDate DATE,
        billAmount DECIMAL(15,2),
        paymentConfirmed BOOLEAN DEFAULT FALSE,
        linkUsed BOOLEAN DEFAULT FALSE
      )
    `);
    console.log("Companies table created or already exists");

    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(255),
        companyId VARCHAR(255),
        companyName VARCHAR(255),
        message TEXT,
        documents TEXT,
        timestamp DATETIME,
        isRead BOOLEAN DEFAULT FALSE
      )
    `);
    console.log("Notifications table created or already exists");
  } catch (err) {
    console.error(
      `Error connecting to MySQL: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    process.exit(1);
  }
};

try {
  if (!fs.existsSync(DOCUMENTS_DIR)) {
    fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
    console.log("Documents directory created successfully");
  }
} catch (err) {
  console.error(`Error initializing files/directories: ${err.message}`);
  process.exit(1);
}

// Save notification to database
const saveNotifications = async (notification) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) saveNotifications`;
  try {
    await db.query(
      `INSERT INTO notifications (id, type, companyId, companyName, message, documents, timestamp, isRead)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notification.id,
        notification.type,
        notification.companyId,
        notification.companyName,
        notification.message || null,
        notification.documents ? JSON.stringify(notification.documents) : null,
        new Date(notification.timestamp),
        notification.isRead || false,
      ]
    );
    console.log(
      `${logPrefix} - Notification saved successfully: ${notification.id}`
    );
  } catch (err) {
    console.error(
      `${logPrefix} - Error saving notification: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    throw new Error("Failed to save notification to database");
  }
};

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "dhruvgaming27041@gmail.com",
    pass: process.env.EMAIL_PASS || "qrykjneowgrjjtzt",
  },
});

transporter.verify((err, success) => {
  if (err) {
    console.error(`Nodemailer configuration error: ${err.message}`);
    console.error("Please check your EMAIL_USER and EMAIL_PASS in .env file.");
    console.error("Ensure you are using a valid Gmail App Password.");
  } else {
    console.log("Nodemailer configuration verified successfully");
  }
});

// IMAP configuration for email monitoring
const imapConfig = {
  imap: {
    user: process.env.EMAIL_USER || "dhruvgaming27041@gmail.com",
    password: process.env.EMAIL_PASS || "qrykjneowgrjjtzt",
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    authTimeout: 3000,
    tlsOptions: { rejectUnauthorized: false },
  },
};

let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// Helper to extract failed email from bounce message
// --- Helper functions for bounce handling ---
function extractFailedEmail(text) {
  // This regex matches the first email address in the bounce message
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

async function setCompanyEmailFailed(email) {
  const [result] = await db.query(
    "UPDATE companies SET status = ?, emailStatus = ?, emailSentDate = ? WHERE email = ?",
    ["Failed", "Failed", new Date(), email]
  );
  return result.affectedRows > 0;
}

// --- Promise-based markAsSeen helper ---
function markAsSeen(connection, uid) {
  return new Promise((resolve, reject) => {
    connection.imap.addFlags(uid, "\\Seen", (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// --- monitorInbox with bounce handling and Promise-based markAsSeen ---
const monitorInbox = async () => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) monitorInbox`;
  try {
    const connection = await imapSimple.connect(imapConfig);
    console.log(`${logPrefix} - Connected to Gmail IMAP`);
    reconnectAttempts = 0;

    await connection.openBox("INBOX");

    connection.on("mail", async () => {
      console.log(`${logPrefix} - New email detected, checking for replies...`);
      const searchCriteria = ["UNSEEN"];
      const fetchOptions = {
        bodies: ["HEADER", "TEXT"],
        struct: true,
        markSeen: false,
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      for (const message of messages) {
        const header = message.parts.find(
          (part) => part.which === "HEADER"
        ).body;
        const from = header.from[0];
        const subject = header.subject[0];
        const inReplyTo = header["in-reply-to"]
          ? header["in-reply-to"][0]
          : null;

        // --- Bounce detection and handling ---
        if (from.includes("mailer-daemon@googlemail.com")) {
          const textPart = message.parts.find((part) => part.which === "TEXT");
          const messageBody = textPart ? textPart.body : "";

          const failedEmail = extractFailedEmail(messageBody);
          if (failedEmail) {
            const updated = await setCompanyEmailFailed(failedEmail);
            if (updated) {
              console.log(`${logPrefix} - Set status to Failed for email: ${failedEmail}`);
            } else {
              console.log(`${logPrefix} - No company found for failed email: ${failedEmail}`);
            }
          } else {
            console.log(`${logPrefix} - Bounce detected but could not extract email`);
          }
          // Mark as seen (Promise-based)
          if (message.attributes && message.attributes.uid) {
            await markAsSeen(connection, message.attributes.uid);
          }
          continue; // Skip further processing for bounce
        }
        // --- End bounce handling ---

        // --- Your existing reply handling code below ---
        const emailMatch = from.match(/<(.+?)>/);
        const senderEmail = emailMatch ? emailMatch[1] : from;

        const [rows] = await db.query(
          "SELECT * FROM companies WHERE email = ?",
          [senderEmail.toLowerCase()]
        );
        const company = rows[0];
        if (!company || !inReplyTo) {
          console.log(
            `${logPrefix} - Skipping email from ${senderEmail}: Not a reply or company not found`
          );
          continue;
        }

        const textPart = message.parts.find((part) => part.which === "TEXT");
        let messageBody = textPart ? textPart.body : "No message content";
        messageBody = messageBody
          .split("\n")
          .filter((line) => !line.startsWith(">"))
          .join("\n")
          .trim();

        let receivedEmails = company.receivedEmails
          ? JSON.parse(company.receivedEmails)
          : [];
        receivedEmails.push({
          subject,
          body: messageBody,
          timestamp: new Date().toISOString(),
        });

        const attachments = [];
        const struct = message.attributes.struct;
        const attachmentParts = struct.filter(
          (part) => part.disposition && part.disposition.type === "ATTACHMENT"
        );
        for (const part of attachmentParts) {
          if (part.disposition.params.filename.toLowerCase().endsWith(".pdf")) {
            const attachment = await connection.getPartData(message, part);
            const fileName = `${company._id}_${Date.now()}_${
              part.disposition.params.filename
            }`;
            const filePath = path.join(DOCUMENTS_DIR, fileName);
            fs.writeFileSync(filePath, attachment);
            attachments.push(fileName);

            await db.query(
              "UPDATE companies SET documentSubmitted = TRUE, documentPath = ?, documents = JSON_ARRAY_APPEND(IFNULL(documents, '[]'), '$', ?) WHERE _id = ?",
              [fileName, fileName, company._id]
            );
          }
        }

        const newNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "company_response",
          companyId: company._id,
          companyName: company.companyName || "Vendor",
          message: messageBody || "No message content",
          documents: attachments,
          timestamp: new Date().toISOString(),
          isRead: false,
        };
        await saveNotifications(newNotification);
        await db.query(
          "UPDATE companies SET status = ?, lastUpdated = ?, receivedEmails = ? WHERE _id = ?",
          [
            "Response Received",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            JSON.stringify(receivedEmails),
            company._id,
          ]
        );

        const [updatedRows] = await db.query(
          "SELECT * FROM companies WHERE _id = ?",
          [company._id]
        );
        io.emit("companyUpdated", updatedRows[0]);
        io.emit("newNotification", newNotification);
        console.log(
          `${logPrefix} - Processed reply from ${senderEmail} for company ${company.companyName}`
        );

        // Mark as seen (Promise-based)
        if (message.attributes && message.attributes.uid) {
          await markAsSeen(connection, message.attributes.uid);
        }
      }
    });

    connection.on("error", (err) => {
      console.error(`${logPrefix} - IMAP error: ${err.message}`);
    });

    connection.on("close", () => {
      console.log(`${logPrefix} - IMAP connection closed, reconnecting...`);
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.pow(2, reconnectAttempts) * 1000;
        setTimeout(monitorInbox, delay);
        reconnectAttempts++;
      } else {
        console.error(
          `${logPrefix} - Max reconnect attempts reached. Stopping IMAP monitoring.`
        );
      }
    });
  } catch (err) {
    console.error(`${logPrefix} - Error monitoring inbox: ${err.message}`);
    if (reconnectAttempts < maxReconnectAttempts) {
      const delay = Math.pow(2, reconnectAttempts) * 1000;
      setTimeout(monitorInbox, delay);
      reconnectAttempts++;
    } else {
      console.error(
        `${logPrefix} - Max reconnect attempts reached. Stopping IMAP monitoring.`
      );
    }
  }
};



// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DOCUMENTS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    cb(
      null,
      `${req.params.companyId || "upload"}_${uniqueSuffix}_${file.originalname}`
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 7 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
   const allowedMimeTypes = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx [1]
  "application/vnd.ms-excel", // .xls [1]
  "text/csv", // .csv [1]
  "application/pdf", // .pdf [1]
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx [1]
  "application/msword", // .doc [1]
];


    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Only Excel, CSV, or PDF files are allowed"));
    }

    cb(null, true);
  },
});

// API Endpoints
app.get("/api/companies", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) GET /api/companies`;
  try {
    console.log(`${logPrefix} - Fetching all companies`);
    const [rows] = await db.query("SELECT * FROM companies");
    res.json(rows);
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res
      .status(500)
      .json({ error: `Failed to fetch companies: ${err.message}` });
  }
});

app.get("/api/companies/:id", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) GET /api/companies/${req.params.id}`;
  try {
    console.log(`${logPrefix} - Fetching company`);
    const [rows] = await db.query("SELECT * FROM companies WHERE _id = ?", [
      req.params.id,
    ]);
    if (rows.length === 0) {
      console.error(`${logPrefix} - Company not found`);
      return res.status(404).json({ error: "Company not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res.status(500).json({ error: `Failed to fetch company: ${err.message}` });
  }
});

app.post("/api/companies/upload", upload.single("file"), async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) POST /api/companies/upload`;
  try {
    const file = req.file;
    if (!file) {
      console.error(`${logPrefix} - No file uploaded`);
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(`${logPrefix} - Uploading Excel file: ${file.originalname}`);

    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    console.log(
      `${logPrefix} - Parsed Excel data:`,
      JSON.stringify(jsonData, null, 2)
    );

    const newCompanies = jsonData.map((row, index) => {
      const companyId = `comp_${Date.now()}_${index}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      return [
        companyId,
        row["S.No"] || row["S.No."] || row["sr no"] || row["Sr No"] || null,
        row["Vendor Name"] || row["vendor name"] || "N/A",
        row["Username"] ||
          row["username"] ||
          row["Users Name"] ||
          row["User Name"] ||
          null,
        row["Group Name"] ||
          row["groupName"] ||
          row["Grouping"] ||
          row["groping"] ||
          null,
        row["Division"] || row["division"] || null,
        row["Status"] || row["status"] || "Not Shown",
        row["Email"] || row["email"] || null,
        row["Phone Number"] ||
          row["phoneNumber"] ||
          row["phonenumber"] ||
          row["Phone"] ||
          null,
        row["Owner Email"] || row["ownerEmail"] || null,
        row["Documents"] || row["documents"]
          ? JSON.stringify([row["Documents"] || row["documents"]])
          : JSON.stringify([]),
        0,
        row["Email Sent Date"] || row["email sent date"]
          ? new Date(row["Email Sent Date"] || row["email sent date"])
          : null,
        null,
        new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        false,
        null,
        null,
        "Pending",
        null,
        null,
        null,
        JSON.stringify([]),
        JSON.stringify([]),
        row["Invoice No"] || row["invoiceNo"] || null,
        row["Invoice Date"] || row["invoiceDate"]
          ? new Date(row["Invoice Date"] || row["invoiceDate"])
          : null,
        row["Bill Amount"] || row["billAmount"] || null,
        false,
        false,
      ];
    });

    if (newCompanies.length === 0) {
      console.error(`${logPrefix} - No valid data found`);
      return res
        .status(400)
        .json({ error: "No valid data found in the Excel file" });
    }

    const query = `
      INSERT INTO companies (
        _id, srNo, companyName, username, groupName, division, status, email, phoneNumber, ownerEmail, documents, emailCount,
        emailSentDate, formSentTimestamp, lastUpdated, documentSubmitted, documentPath, lastEmailSent, emailStatus, emailError,
        reminderSent, linkCreatedAt, sentEmails, receivedEmails, invoiceNo, invoiceDate, billAmount, paymentConfirmed, linkUsed
      ) VALUES ?
    `;
    await db.query(query, [newCompanies]);

    console.log(
      `${logPrefix} - Companies uploaded successfully: ${newCompanies.length}`
    );

    io.emit(
      "companiesUploaded",
      newCompanies.map((row) => ({
        _id: row[0],
        srNo: row[1],
        companyName: row[2],
        username: row[3],
        groupName: row[4],
        division: row[5],
        status: row[6],
        email: row[7],
        phoneNumber: row[8],
        ownerEmail: row[9],
        documents: row[10],
        emailCount: row[11],
        emailSentDate: row[12],
        formSentTimestamp: row[13],
        lastUpdated: row[14],
        documentSubmitted: row[15],
        documentPath: row[16],
        lastEmailSent: row[17],
        emailStatus: row[18],
        emailError: row[19],
        reminderSent: row[20],
        linkCreatedAt: row[21],
        sentEmails: row[22],
        receivedEmails: row[23],
        invoiceNo: row[24],
        invoiceDate: row[25],
        billAmount: row[26],
        paymentConfirmed: row[27],
        linkUsed: row[28],
      }))
    );

    fs.unlinkSync(file.path);

    res
      .status(200)
      .json({
        message: "Companies uploaded successfully",
        companies: newCompanies,
      });
  } catch (err) {
    console.error(`${logPrefix} - Error: ${err.message}`);
    res
      .status(500)
      .json({ error: `Failed to upload companies: ${err.message}` });
  }
});

app.post("/api/companies/add", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) POST /api/companies/add`;
  try {
    const {
      companyName,
      username,
      groupName,
      division,
      email,
      phoneNumber,
      billAmount,
      status,
      lastUpdated,
    } = req.body;

    console.log(`${logPrefix} - Adding new customer: ${companyName}`);

    // Validate required fields
    if (!companyName || !email) {
      console.error(`${logPrefix} - Missing required fields`);
      return res.status(400).json({ error: "Company name and email are required" });
    }

    // Generate unique company ID
    const companyId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get the highest srNo to assign the next one
    const [rows] = await db.query("SELECT MAX(CAST(COALESCE(srNo, '0') AS UNSIGNED)) as maxSrNo FROM companies");
    const nextSrNo = (parseInt(rows[0].maxSrNo) || 0) + 1;

    // Insert new company into the database
    await db.query(
      `
      INSERT INTO companies (
        _id, srNo, companyName, username, groupName, division, status, email, phoneNumber, 
        documents, emailCount, lastUpdated, billAmount, sentEmails, receivedEmails
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        companyId,
        nextSrNo.toString(),
        companyName,
        username || null,
        groupName || null,
        division || null,
        status || "Not Shown",
        email.trim().toLowerCase(),
        phoneNumber || null,
        JSON.stringify([]),
        0,
        lastUpdated,
        billAmount ? parseFloat(billAmount) : null,
        JSON.stringify([]),
        JSON.stringify([]),
      ]
    );

    // Fetch the newly added company
    const [newCompanyRows] = await db.query("SELECT * FROM companies WHERE _id = ?", [companyId]);
    const newCompany = newCompanyRows[0];

    // Emit Socket.IO event
    io.emit("companyAdded", newCompany);
    console.log(`${logPrefix} - Customer added successfully: ${companyId}`);

    res.status(200).json({ message: "Customer added successfully", company: newCompany });
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res.status(500).json({ error: `Failed to add customer: ${err.message}` });
  }
});

app.put("/api/companies/:id", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) PUT /api/companies/${req.params.id}`;
  try {
    const companyId = req.params.id;
    const updatedData = req.body;
    console.log(`${logPrefix} - Updating company`);

    const [rows] = await db.query("SELECT * FROM companies WHERE _id = ?", [
      companyId,
    ]);
    if (rows.length === 0) {
      console.error(`${logPrefix} - Company not found`);
      return res.status(404).json({ error: "Company not found" });
    }

    await db.query(
      `UPDATE companies SET srNo = ?, companyName = ?, username = ?, groupName = ?, division = ?, status = ?, email = ?, phoneNumber = ?, ownerEmail = ?, documents = ?, emailCount = ?, emailSentDate = ?, formSentTimestamp = ?, lastUpdated = ?, documentSubmitted = ?, documentPath = ?, lastEmailSent = ?, emailStatus = ?, emailError = ?, reminderSent = ?, linkCreatedAt = ?, sentEmails = ?, receivedEmails = ?, invoiceNo = ?, invoiceDate = ?, billAmount = ?, paymentConfirmed = ?, linkUsed = ? WHERE _id = ?`,
      [
        updatedData.srNo !== undefined ? updatedData.srNo : rows[0].srNo,
        updatedData.companyName || rows[0].companyName,
        updatedData.username || rows[0].username,
        updatedData.groupName || rows[0].groupName,
        updatedData.division || rows[0].division,
        updatedData.status || rows[0].status,
        updatedData.email || rows[0].email,
        updatedData.phoneNumber || rows[0].phoneNumber,
        updatedData.ownerEmail || rows[0].ownerEmail,
        updatedData.documents || rows[0].documents,
        updatedData.emailCount !== undefined
          ? updatedData.emailCount
          : rows[0].emailCount,
        updatedData.emailSentDate
          ? new Date(updatedData.emailSentDate)
          : rows[0].emailSentDate,
        updatedData.formSentTimestamp || rows[0].formSentTimestamp,
        updatedData.lastUpdated || rows[0].lastUpdated,
        updatedData.documentSubmitted !== undefined
          ? updatedData.documentSubmitted
          : rows[0].documentSubmitted,
        updatedData.documentPath || rows[0].documentPath,
        updatedData.lastEmailSent
          ? new Date(updatedData.lastEmailSent)
          : rows[0].lastEmailSent,
        updatedData.emailStatus || rows[0].emailStatus,
        updatedData.emailError || rows[0].emailError,
        updatedData.reminderSent || rows[0].reminderSent,
        updatedData.linkCreatedAt
          ? new Date(updatedData.linkCreatedAt)
          : rows[0].linkCreatedAt,
        updatedData.sentEmails || rows[0].sentEmails,
        updatedData.receivedEmails || rows[0].receivedEmails,
        updatedData.invoiceNo || rows[0].invoiceNo,
        updatedData.invoiceDate
          ? new Date(updatedData.invoiceDate)
          : rows[0].invoiceDate,
        updatedData.billAmount || rows[0].billAmount,
        updatedData.paymentConfirmed !== undefined
          ? updatedData.paymentConfirmed
          : rows[0].paymentConfirmed,
        updatedData.linkUsed !== undefined
          ? updatedData.linkUsed
          : rows[0].linkUsed,
        companyId,
      ]
    );

    const [updatedRows] = await db.query(
      "SELECT * FROM companies WHERE _id = ?",
      [companyId]
    );
    io.emit("companyUpdated", updatedRows[0]);
    console.log(`${logPrefix} - Company updated successfully`);
    res.status(200).json(updatedRows[0]);
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res.status(500).json({ error: `Failed to update company: ${err.message}` });
  }
});

app.delete("/api/companies/:id", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) DELETE /api/companies/${req.params.id}`;
  try {
    const companyId = req.params.id;
    console.log(`${logPrefix} - Deleting company`);

    const [rows] = await db.query("SELECT * FROM companies WHERE _id = ?", [
      companyId,
    ]);
    if (rows.length === 0) {
      console.error(`${logPrefix} - Company not found`);
      return res.status(404).json({ error: "Company not found" });
    }

    await db.query("DELETE FROM companies WHERE _id = ?", [companyId]);
    io.emit("companyDeleted", companyId);
    console.log(`${logPrefix} - Company deleted successfully`);
    res.status(200).json({ message: "Company deleted successfully" });
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res.status(500).json({ error: `Failed to delete company: ${err.message}` });
  }
});

app.get("/api/get-email-user", (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) GET /api/get-email-user`;
  console.log(`${logPrefix} - Fetching email user`);
  const emailUser = process.env.EMAIL_USER || "rajansatvara@gmail.com";
  res.json({ emailUser });
});

const sendEmailWithDelay = async (mailOptions, companyId) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) Email for company ${companyId}`;
  try {
    console.log(`${logPrefix} - Attempting to send email to ${mailOptions.to}`);
    console.log(`${logPrefix} - Email content:`, mailOptions.text);

    const info = await transporter.sendMail(mailOptions);
    console.log(`${logPrefix} - Email sent successfully: ${info.messageId}`);

    let sentEmails = [];
    const [rows] = await db.query(
      "SELECT sentEmails FROM companies WHERE _id = ?",
      [companyId]
    );
    if (rows[0].sentEmails) {
      sentEmails = JSON.parse(rows[0].sentEmails);
    }
    sentEmails.push({
      subject: mailOptions.subject,
      body: mailOptions.text,
      timestamp: new Date().toISOString(),
    });

    // Retry database update to prevent race conditions
    let updateSuccess = false;
    for (let i = 0; i < 3; i++) {
      try {
        await db.query(
          "UPDATE companies SET emailStatus = ?, lastEmailSent = ?, emailError = NULL, linkCreatedAt = ?, sentEmails = ?, status = ?, emailCount = emailCount + 1, formSentTimestamp = ? WHERE _id = ?",
          [
            "Sent",
            new Date(),
            null,
            new Date(),
            JSON.stringify(sentEmails),
            "Show Mail",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            companyId,
          ]
        );
        updateSuccess = true;
        break;
      } catch (dbErr) {
        console.warn(
          `${logPrefix} - Database update attempt ${i + 1} failed: ${
            dbErr.message
          }, SQL: ${dbErr.sql || "N/A"}, SQLState: ${dbErr.sqlState || "N/A"}`
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!updateSuccess) {
      console.error(`${logPrefix} - Failed to update database after retries`);
      throw new Error("Database update failed");
    }

    console.log(`${logPrefix} - Database updated: emailStatus=Sent`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`${logPrefix} - Error sending email: ${err.message}`);
    await db.query(
      "UPDATE companies SET emailStatus = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
      [
        "Failed",
        err.message,
        new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        companyId,
      ]
    );
    console.error(
      `${logPrefix} - Database updated: emailStatus=Failed, emailError=${err.message}`
    );
    return { success: false, error: err.message };
  }
};

// app.post("/api/send-single-email", async (req, res) => {
//   const logPrefix = `(${new Date().toLocaleString("en-IN", {
//     timeZone: "Asia/Kolkata",
//   })}) POST /api/send-single-email`;
//   try {
//     const { companyId } = req.body;
//     console.log(`${logPrefix} - Sending email to company ${companyId}`);

//     if (!companyId) {
//       console.error(`${logPrefix} - Company ID is required`);
//       return res.status(400).json({ error: "Company ID is required" });
//     }

//     const [companies] = await db.query(
//       "SELECT * FROM companies WHERE _id = ?",
//       [companyId]
//     );
//     if (companies.length === 0) {
//       console.error(`${logPrefix} - Company not found`);
//       return res.status(404).json({ error: "Company not found" });
//     }

//     const company = companies[0];
//     if (!company.email) {
//       console.error(`${logPrefix} - No email provided`);
//       await db.query(
//         "UPDATE companies SET status = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
//         [
//           "Failed",
//           "No email provided",
//           new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
//           company._id,
//         ]
//       );
//       return res
//         .status(400)
//         .json({ error: "No email provided for the company" });
//     }

//     const companyName = company.companyName || "Vendor";
//     const submissionLink = `http://localhost:3003/submit-documents/${company._id}`;

//     const emailText = `
// Dear ${companyName},

// Kindly refer to the below list of vendors. You are requested to provide balance confirmation as on 31st Mar 2025 on a priority basis.

// Please submit your documents using the following link: ${submissionLink}

// Note: This link will expire after one submission.

// Best regards,
// Technow,
// Phone: +91 89345-93685
//     `;

//     const mailOptions = {
//       from: `"FUJIFILM" <${
//         process.env.EMAIL_USER || "rajansatvara@gmail.com"
//       }>`,
//       to: company.email.trim().toLowerCase(),
//       subject: "Request for Balance Confirmation as on 31st Mar 2025",
//       text: emailText.trim(),
//     };

//     console.log(`${logPrefix} - Sending email to: ${mailOptions.to}`);

//     const result = await sendEmailWithDelay(mailOptions, company._id);
//     if (result.success) {
//       // Update status to 'Email Sent'
//       const [updateResult] = await db.query(
//         "UPDATE companies SET status = ?, emailError = NULL, lastUpdated = ? WHERE _id = ?",
//         [
//           "Email Sent",
//           new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
//           company._id,
//         ]
//       );
//       console.log('Rows affected:', updateResult.affectedRows);

//       const newNotification = {
//         id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//         type: "email_sent",
//         companyId: company._id,
//         companyName,
//         message: `Email sent to ${company.email}`,
//         timestamp: new Date().toISOString(),
//         isRead: false,
//       };
//       await saveNotifications(newNotification);

//       const [updatedRows] = await db.query(
//         "SELECT * FROM companies WHERE _id = ?",
//         [companyId]
//       );
//       io.emit("companyUpdated", updatedRows[0]);
//       io.emit("newNotification", newNotification);

//       console.log(`${logPrefix} - Email sent successfully`);
//       res
//         .status(200)
//         .json({ message: "Email sent successfully", companyId: company._id });
//     } else {
//       // Update status to 'Failed'
//       await db.query(
//         "UPDATE companies SET status = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
//         [
//           "Failed",
//           result.error,
//           new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
//           company._id,
//         ]
//       );
//       console.error(`${logPrefix} - Failed to send email: ${result.error}`);
//       res.status(500).json({ error: `Failed to send email: ${result.error}` });
//     }
//   } catch (err) {
//     console.error(
//       `${logPrefix} - Error: ${err.message}, SQL: ${
//         err.sql || "N/A"
//       }, SQLState: ${err.sqlState || "N/A"}`
//     );
//     res.status(500).json({ error: `Failed to send email: ${err.message}` });
//   }
// });
app.post("/api/send-single-email", upload.single('attachment'), async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}) POST /api/send-single-email`;
  try {
    const { companyId, cc, subject, body } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    // Fetch the company from the database
    const [companies] = await db.query(
      "SELECT * FROM companies WHERE _id = ?",
      [companyId]
    );
    if (companies.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    const company = companies[0];
    if (!company.email) {
      await db.query(
        "UPDATE companies SET status = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
        [
          "Failed",
          "No email provided",
          new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          company._id,
        ]
      );
      return res.status(400).json({ error: "No email provided for the company" });
    }

    // Prepare email content
    const companyName = company.companyName || "Vendor";
    // Change localhost to your production domain as needed
    const submissionLink = `"https://fuji.uday.me/submit-documents/${company._id}`;
     const submissionLinkcompany = `"https://fuji.uday.me/submit-documents/${company.companyName}`;
    const defaultBody = `
Dear ${companyName},

Kindly refer to the below list of vendors. You are requested to provide balance confirmation as on 31st Mar 2025 on a priority basis.

Please submit your documents using the following link: ${submissionLink}

Note: This link will expire after one submission.

Best regards,
Technow,
Phone: +91 89345-93685
    `;

    // HTML version for clickable link
    const emailHtml = `
      <p>Dear ${companyName},</p>
      <p>Kindly refer to the below list of vendors. You are requested to provide balance confirmation as on 31st Mar 2025 on a priority basis.</p>
      <p>
        Please submit your documents using the following link:<br/>
        <a href="${submissionLink}">${submissionLinkcompany}</a>
      </p>
      <p>Note: This link will expire after one submission.</p>
      <p>Best regards,<br/>Technow,<br/>Phone: +91 89345-93685</p>
    `;

    // Parse CC field
    const ccList = cc ? cc.split(',').map(e => e.trim()).filter(Boolean) : undefined;

    // Prepare mail options
    const mailOptions = {
      from: `"FUJIFILM" <${process.env.EMAIL_USER || "filmfuzzy180@gmail.com"}>`,
      to: company.email.trim().toLowerCase(),
      cc: ccList,
      subject: subject || "Request for Balance Confirmation as on 31st Mar 2025",
      text: body || defaultBody.trim(),
      html: emailHtml,
      attachments: req.file
        ? [{
            filename: req.file.originalname,
            path: req.file.path,
          }]
        : [],
    };

    // Send the email (replace with your own function as needed)
    const result = await sendEmailWithDelay(mailOptions, company._id);

    // Clean up uploaded file
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }

    if (result.success) {
      await db.query(
        "UPDATE companies SET status = ?, emailError = NULL, lastUpdated = ? WHERE _id = ?",
        [
          "Email Sent",
          new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          company._id,
        ]
      );
      // Optionally emit notifications here
      res.status(200).json({ message: "Email sent successfully", companyId: company._id });
    } else {
      await db.query(
        "UPDATE companies SET status = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
        [
          "Failed",
          result.error,
          new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          company._id,
        ]
      );
      res.status(500).json({ error: `Failed to send email: ${result.error}` });
    }
  } catch (err) {
    res.status(500).json({ error: `Failed to send email: ${err.message}` });
  }
});

app.post("/api/send-bulk-emails", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) POST /api/send-bulk-emails`;
  try {
    console.log(`${logPrefix} - Starting bulk email sending`);
    const { companyIds } = req.body;

    let query =
      "SELECT * FROM companies WHERE emailStatus = 'Pending' OR emailStatus = 'Failed'";
    let queryParams = [];
    if (companyIds && Array.isArray(companyIds) && companyIds.length > 0) {
      query += " AND _id IN (?)";
      queryParams = [companyIds];
    }

    const [companies] = await db.query(query, queryParams);
    if (companies.length === 0) {
      console.log(`${logPrefix} - No companies pending for email sending`);
      return res
        .status(400)
        .json({ message: "No companies pending for email sending" });
    }

    let sentCount = 0;
    let failedCount = 0;
    const failedCompanies = [];

    for (const company of companies) {
      if (!company.email) {
        console.error(
          `${logPrefix} - No email provided for company ${company._id}`
        );
        await db.query(
          "UPDATE companies SET emailStatus = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
          [
            "Failed",
            "No email provided",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            company._id,
          ]
        );
        failedCount++;
        failedCompanies.push({
          companyId: company._id,
          error: "No email provided",
        });
        continue;
      }

      const companyName = company.companyName || "Vendor";
      const submissionLink = `https://fuji.uday.me/submit-documents/${company._id}`;
      const emailText = `
Dear ${companyName},

Kindly refer to the below list of vendors. You are requested to provide balance confirmation as on 31st Mar 2025 on a priority basis.

Please submit your documents using the following link: ${submissionLink}

Note: This link will expire after one submission.

Best regards,
Technow,
Phone: +91 89345-93685
      `;

      const mailOptions = {
        from: `"FUJIFILM" <${
          process.env.EMAIL_USER || "filmfuzzy180@gmail.com"
        }>`,
        to: company.email.trim().toLowerCase(),
        subject: "Request for Balance Confirmation as on 31st Mar 2025",
        text: emailText.trim(),
      };

      console.log(`${logPrefix} - Sending bulk email to: ${mailOptions.to}`);

      const result = await sendEmailWithDelay(mailOptions, company._id);
      if (result.success) {
        sentCount++;
        const newNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "email_sent",
          companyId: company._id,
          companyName,
          message: `Email sent to ${company.email}`,
          timestamp: new Date().toISOString(),
          isRead: false,
        };
        await saveNotifications(newNotification);

        const [updatedRows] = await db.query(
          "SELECT * FROM companies WHERE _id = ?",
          [company._id]
        );
        io.emit("companyUpdated", updatedRows[0]);
        io.emit("newNotification", newNotification);
      } else {
        failedCount++;
        failedCompanies.push({ companyId: company._id, error: result.error });
      }

      await new Promise((resolve) => setTimeout(resolve, 60000));
    }

    const report = {
      total: companies.length,
      sent: sentCount,
      failed: failedCount,
      failedCompanies,
    };

    console.log(`${logPrefix} - Bulk email sending completed:`, report);
    res.status(200).json({ message: "Bulk email sending completed", report });
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res
      .status(500)
      .json({ error: `Failed to send bulk emails: ${err.message}` });
  }
});

app.post("/api/resend-failed-emails", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) POST /api/resend-failed-emails`;
  try {
    console.log(`${logPrefix} - Resending failed emails`);

    // 1. Fetch companies with failed email status
    const [companies] = await db.query(
      "SELECT * FROM companies WHERE status = 'Failed'"
    );
    if (companies.length === 0) {
      console.log(`${logPrefix} - No failed emails to resend`);
      return res.status(400).json({ message: "No failed emails to resend" });
    }

    let sentCount = 0;
    let failedCount = 0;
    const failedCompanies = [];

    for (const company of companies) {
      if (!company.email) {
        // 2. Handle missing email
        console.error(
          `${logPrefix} - No email provided for company ${company._id}`
        );
        await db.query(
          "UPDATE companies SET emailStatus = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
          [
            "Failed",
            "No email provided",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            company._id,
          ]
        );
        failedCount++;
        failedCompanies.push({
          companyId: company._id,
          error: "No email provided",
        });
        continue;
      }

      const companyName = company.companyName || "Vendor";
      const submissionLink = `https://fujiapi.uday.me/submit-documents/${company._id}`;
      const emailText = `
Dear ${companyName},

This is a reminder to provide balance confirmation as on 31st Mar 2025 on a priority basis.

Please submit your documents using the following link: ${submissionLink}

Note: This link will expire after one submission.

Best regards,
Technow,
Phone: +91 89345-93685
      `;

      const mailOptions = {
        from: `"FUJIFILM" <${
          process.env.EMAIL_USER || "filmfuzzy180@gmail.com"
        }>`,
        to: company.email.trim().toLowerCase(),
        subject:
          "Reminder: Request for Balance Confirmation as on 31st Mar 2025",
        text: emailText.trim(),
      };

      console.log(`${logPrefix} - Resending email to: ${mailOptions.to}`);

      // 3. Attempt to send email
      const result = await sendEmailWithDelay(mailOptions, company._id);
      if (result.success) {
        sentCount++;
        // 4. Update emailStatus to 'Email Sent' and set emailSentDate to current time
        await db.query(
          "UPDATE companies SET status = ?, emailStatus = ?, emailError = NULL, lastUpdated = ?, emailSentDate = ? WHERE _id = ?",
          [
            "Email Sent",
            "Sent",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            new Date(),
            company._id,
          ]
        );

        const newNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "email_sent",
          companyId: company._id,
          companyName,
          message: `Reminder email sent to ${company.email}`,
          timestamp: new Date().toISOString(),
          isRead: false,
        };
        await saveNotifications(newNotification);

        io.emit("newNotification", newNotification);

        // Emit companyUpdated event to reflect changes
        const [updatedRows] = await db.query(
          "SELECT * FROM companies WHERE _id = ?",
          [company._id]
        );
        io.emit("companyUpdated", updatedRows[0]);
      } else {
        // 5. Handle failed email send
        failedCount++;
        failedCompanies.push({ companyId: company._id, error: result.error });

        await db.query(
          "UPDATE companies SET emailStatus = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
          [
            "Failed",
            result.error || "Unknown error",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            company._id,
          ]
        );
      }

      // 6. Wait 60 seconds before next email
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }

    const report = {
      total: companies.length,
      sent: sentCount,
      failed: failedCount,
      failedCompanies,
    };

    console.log(`${logPrefix} - Resending failed emails completed:`, report);
    res
      .status(200)
      .json({ message: "Resending failed emails completed", report });
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res.status(500).json({ error: `Failed to resend emails: ${err.message}` });
  }
});


app.post("/api/send-quarterly-reminders", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) POST /api/send-quarterly-reminders`;
  try {
    console.log(`${logPrefix} - Sending quarterly reminders`);

    const currentDate = new Date();
    const fifteenDaysAgo = new Date(
      currentDate.getTime() - 15 * 24 * 60 * 60 * 1000
    );
    const quarters = [
      {
        start: new Date(currentDate.getFullYear(), 0, 1),
        end: new Date(currentDate.getFullYear(), 2, 31),
      },
      {
        start: new Date(currentDate.getFullYear(), 3, 1),
        end: new Date(currentDate.getFullYear(), 5, 30),
      },
      {
        start: new Date(currentDate.getFullYear(), 6, 1),
        end: new Date(currentDate.getFullYear(), 8, 30),
      },
      {
        start: new Date(currentDate.getFullYear(), 9, 1),
        end: new Date(currentDate.getFullYear(), 11, 31),
      },
    ];
    const currentQuarter = quarters.find(
      (q) => currentDate >= q.start && currentDate <= q.end
    );

    const [rows] = await db.query(
      "SELECT * FROM companies WHERE formSentTimestamp <= ? AND (documentSubmitted = FALSE OR paymentConfirmed = FALSE) AND (reminderSent IS NULL OR reminderSent = 'FALSE')",
      [fifteenDaysAgo.toISOString()]
    );
    const companies = rows;

    if (companies.length === 0) {
      console.log(`${logPrefix} - No companies require reminders`);
      return res
        .status(400)
        .json({ message: "No companies require reminders" });
    }

    let sentCount = 0;
    let failedCount = 0;
    const failedCompanies = [];

    for (const company of companies) {
      if (!company.email) {
        console.error(
          `${logPrefix} - No email provided for company ${company._id}`
        );
        await db.query(
          "UPDATE companies SET emailStatus = ?, emailError = ?, lastUpdated = ? WHERE _id = ?",
          [
            "Failed",
            "No email provided",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            company._id,
          ]
        );
        failedCount++;
        failedCompanies.push({
          companyId: company._id,
          error: "No email provided",
        });
        continue;
      }

      let linkExpired = false;
      if (company.linkCreatedAt) {
        const linkCreationDate = new Date(company.linkCreatedAt);
        const diffDays =
          (currentDate - linkCreationDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 15) {
          linkExpired = true;
        }
      } else {
        linkExpired = true;
      }

      if (linkExpired) {
        await db.query("UPDATE companies SET linkCreatedAt = ? WHERE _id = ?", [
          currentDate,
          company._id,
        ]);
      }

      const companyName = company.companyName || "Vendor";
      const submissionLink = `https://fuji.uday.me/submit-documents/${company._id}`;
      const emailText = `
Dear ${companyName},

This is a quarterly reminder to submit the balance confirmation as on 31st Mar 2025 for the period ${currentQuarter.start.toLocaleDateString(
        "en-IN"
      )} to ${currentQuarter.end.toLocaleDateString("en-IN")}).

Please submit your documents using the following link: ${submissionLink}

Note: This link will expire after one submission.

Best regards,
Technow,
Phone: +91 89345-93685
      `;

      const mailOptions = {
        from: `"FUJIFILM" <${
          process.env.EMAIL_USER || "filmfuzzy180@gmail.com"
        }>`,
        to: company.email.trim().toLowerCase(),
        subject: `Quarterly Reminder: Balance Confirmation for ${currentQuarter.start.toLocaleDateString(
          "en-IN"
        )} - ${currentQuarter.end.toLocaleDateString("en-IN")}`,
        text: emailText.trim(),
      };

      console.log(
        `${logPrefix} - Sending quarterly reminder to: ${mailOptions.to}`
      );

      const result = await sendEmailWithDelay(mailOptions, company._id);
      if (result.success) {
        sentCount++;
        const newNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "reminder_sent",
          companyId: company._id,
          companyName,
          message: `Quarterly reminder email sent to ${company.email}`,
          timestamp: new Date().toISOString(),
          isRead: false,
        };

        await saveNotifications(newNotification);

        await db.query(
          "UPDATE companies SET reminderSent = 'TRUE' WHERE _id = ?",
          [company._id]
        );

        io.emit("newNotification", newNotification);
      } else {
        failedCount++;
        failedCompanies.push({ companyId: company._id, error: result.error });
      }

      await new Promise((resolve) => setTimeout(resolve, 60000));
    }

    const report = {
      total: companies.length,
      sent: sentCount,
      failed: failedCount,
      failedCompanies,
    };

    console.log(`${logPrefix} - Quarterly reminders sent:`, report);
    res.status(200).json({ message: "Quarterly reminders sent", report });
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res
      .status(500)
      .json({ error: `Failed to send quarterly reminders: ${err.message}` });
  }
});

// Serve the submission form
app.get("/submit-documents/:companyId", (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) GET /submit-documents/${req.params.companyId}`;
  try {
    const filePath = path.join(__dirname, "public", "submit-documents.html");
    if (!fs.existsSync(filePath)) {
      console.error(`${logPrefix} - File not found: submit-documents.html`);
      return res.status(404).json({ error: "File not found" });
    }
    res.sendFile(filePath);
  } catch (err) {
    console.error(`${logPrefix} - Error: ${err.message}`);
    res
      .status(500)
      .json({ error: `Failed to serve submission form: ${err.message}` });
  }
});

// app.post(
//   "/submit-documents/:companyId",
//   upload.fields([{ name: "paymentProof", maxCount: 1 }]),
//   async (req, res) => {
//     const logPrefix = `(${new Date().toLocaleString("en-IN", {
//       timeZone: "Asia/Kolkata",
//     })}) POST /submit-documents/${req.params.companyId}`;
//     try {
//       const companyId = req.params.companyId;
//       console.log(
//         `${logPrefix} - Starting payment proof submission for companyId: ${companyId}`
//       );
//       console.log(`${logPrefix} - Received files:`, req.files || "None");
//       console.log(`${logPrefix} - Form data:`, req.body || "None");

//       // Validate companyId
//       if (!companyId || typeof companyId !== "string") {
//         console.error(`${logPrefix} - Invalid companyId`);
//         return res.status(400).json({ error: "Invalid company ID" });
//       }

//       // Check if company exists
//       console.log(`${logPrefix} - Querying database for company`);
//       const [rows] = await db.query("SELECT * FROM companies WHERE _id = ?", [
//         companyId,
//       ]);
//       if (rows.length === 0) {
//         console.error(`${logPrefix} - Company not found`);
//         return res.status(404).json({ error: "Company not found" });
//       }

//       const company = rows[0];
//       console.log(
//         `${logPrefix} - Company found: ${company.companyName || "Unnamed"}`
//       );

//       // Check if documents have already been submitted
//       if (company.documentSubmitted || company.linkUsed) {
//         console.error(
//           `${logPrefix} - Submission blocked: documentSubmitted=${company.documentSubmitted}, linkUsed=${company.linkUsed}`
//         );
//         return res
//           .status(400)
//           .json({
//             error: "Payment proof has already been submitted or link has been used",
//           });
//       }

//       // Get form data
//       const paymentProofFile =
//         req.files && req.files["paymentProof"]
//           ? req.files["paymentProof"][0]
//           : null;
//       console.log(
//         `${logPrefix} - Parsed form data: paymentProofFile=${
//           paymentProofFile ? paymentProofFile.filename : "none"
//         }`
//       );

//       // Validate payment proof file
//       if (!paymentProofFile) {
//         console.error(
//           `${logPrefix} - Validation failed: Payment proof document missing`
//         );
//         return res
//           .status(400)
//           .json({ error: "Payment proof document is required" });
//       }
//       if (!paymentProofFile.mimetype.includes("pdf")) {
//         console.error(
//           `${logPrefix} - Validation failed: Payment proof document is not a PDF`
//         );
//         return res.status(400).json({ error: "Payment proof must be a PDF" });
//       }

//       // Prepare documents array
//       const documents = [paymentProofFile.filename];
//       console.log(`${logPrefix} - Documents to save:`, documents);

//       // Create notification message
//       const notificationMessage = `Payment proof submitted by ${
//         company.companyName || "Vendor"
//       }`;

//       // Update company in the database with retry logic
//       console.log(`${logPrefix} - Updating company in database`);
//       let updateSuccess = false;
//       for (let i = 0; i < 3; i++) {
//         try {
//           console.log(`${logPrefix} - Executing UPDATE query with params:`, [
//             paymentProofFile.filename,
//             JSON.stringify(documents),
//             "Payment Proof Submitted",
//             new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
//             companyId,
//           ]);
//           const [result] = await db.query(
//             "UPDATE companies SET documentSubmitted = TRUE, documentPath = ?, documents = ?, status = ?, lastUpdated = ? WHERE _id = ? AND documentSubmitted = FALSE AND linkUsed = FALSE",
//             [
//               paymentProofFile.filename,
//               JSON.stringify(documents),
//               "Response Received",
//               new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
//               companyId,
//             ]
//           );
//           if (result.affectedRows === 0) {
//             console.error(
//               `${logPrefix} - No rows updated, possible database mismatch or companyId not found: ${companyId}`
//             );
//             return res
//               .status(500)
//               .json({
//                 error: "Failed to update company data: No rows affected",
//               });
//           }
//           console.log(
//             `${logPrefix} - Company updated successfully, affectedRows: ${result.affectedRows}`
//           );
//           updateSuccess = true;
//           break;
//         } catch (dbErr) {
//           console.warn(
//             `${logPrefix} - Database update attempt ${i + 1} failed: ${
//               dbErr.message
//             }, SQL: ${dbErr.sql || "N/A"}, SQLState: ${dbErr.sqlState || "N/A"}`
//           );
//           await new Promise((resolve) => setTimeout(resolve, 1000));
//         }
//       }

//       if (!updateSuccess) {
//         console.error(`${logPrefix} - Failed to update database after retries`);
//         return res
//           .status(500)
//           .json({
//             error: "Failed to update company data: Database update failed",
//           });
//       }

//       // Create a notification
//       const newNotification = {
//         id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//         type: "payment_proof_submitted",
//         companyId: company._id,
//         companyName: company.companyName || "Vendor",
//         message: notificationMessage,
//         documents: documents,
//         timestamp: new Date().toISOString(),
//         isRead: false,
//       };
//       console.log(`${logPrefix} - Creating notification:`, newNotification);

//       try {
//         await saveNotifications(newNotification);
//         console.log(`${logPrefix} - Notification saved successfully`);
//       } catch (notifErr) {
//         console.error(
//           `${logPrefix} - Failed to save notification: ${
//             notifErr.message
//           }, SQL: ${notifErr.sql || "N/A"}, SQLState: ${
//             notifErr.sqlState || "N/A"
//           }`
//         );
//       }

//       // Emit Socket.IO events
//       console.log(`${logPrefix} - Fetching updated company data for Socket.IO`);
//       try {
//         const [updatedRows] = await db.query(
//           "SELECT * FROM companies WHERE _id = ?",
//           [companyId]
//         );
//         io.emit("companyUpdated", updatedRows[0] || {});
//         io.emit("newNotification", newNotification);
//         console.log(
//           `${logPrefix} - Socket.IO events emitted: companyUpdated, newNotification`
//         );
//       } catch (socketErr) {
//         console.error(
//           `${logPrefix} - Failed to emit Socket.IO events: ${socketErr.message}`
//         );
//       }

//       console.log(`${logPrefix} - Payment proof submission completed successfully`);
//       return res
//         .status(200)
//         .json({ message: "Payment proof submission successful" });
//     } catch (err) {
//       console.error(`${logPrefix} - Error: ${err.message}`);
//       if (err instanceof multer.MulterError) {
//         return res
//           .status(400)
//           .json({ error: `File upload error: ${err.message}` });
//       }
//       return res
//         .status(500)
//         .json({ error: `Failed to submit payment proof: ${err.message}` });
//     }
//   }
// );

app.post(
  "/submit-documents/:companyId",
  upload.fields([{ name: "paymentProof", maxCount: 1 }]),
  async (req, res) => {
    const logPrefix = `(${new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    })}) POST /submit-documents/${req.params.companyId}`;
    try {
      const companyId = req.params.companyId;
      console.log(
        `${logPrefix} - Starting payment proof submission for companyId: ${companyId}`
      );
      console.log(`${logPrefix} - Received files:`, req.files || "None");
      console.log(`${logPrefix} - Form data:`, req.body || "None");

      // Validate companyId
      if (!companyId || typeof companyId !== "string") {
        console.error(`${logPrefix} - Invalid companyId`);
        return res.status(400).json({ error: "Invalid company ID" });
      }

      // Check if company exists
      console.log(`${logPrefix} - Querying database for company`);
      const [rows] = await db.query("SELECT * FROM companies WHERE _id = ?", [
        companyId,
      ]);
      if (rows.length === 0) {
        console.error(`${logPrefix} - Company not found`);
        return res.status(404).json({ error: "Company not found" });
      }

      const company = rows[0];
      console.log(
        `${logPrefix} - Company found: ${company.companyName || "Unnamed"}`
      );

      // Check if resubmission is allowed
      if (company.documentSubmitted || company.linkUsed) {
        console.error(
          `${logPrefix} - Submission blocked: documentSubmitted=${company.documentSubmitted}, linkUsed=${company.linkUsed}`
        );
        return res
          .status(400)
          .json({
            error: "Payment proof has already been submitted or link has been used",
          });
      }

      // Get form data
      const { agreement, reason } = req.body;
      const paymentProofFile =
        req.files && req.files["paymentProof"]
          ? req.files["paymentProof"][0]
          : null;
      console.log(
        `${logPrefix} - Parsed form data: agreement=${agreement}, reason=${
          reason || "none"
        }, paymentProofFile=${paymentProofFile ? paymentProofFile.filename : "none"}`
      );

      // Validate agreement
      if (!agreement || !["agree", "disagree"].includes(agreement)) {
        console.error(`${logPrefix} - Validation failed: Invalid agreement value`);
        return res.status(400).json({ error: "Invalid agreement value" });
      }

      let documents = [];
      let documentPath = null;
      let status = null;
      let notificationMessage = null;
      let documentSubmitted = false;
      let linkUsed = false;

      // Handle disagree case
      if (agreement === "disagree") {
        if (!reason || reason.trim() === "") {
          console.error(
            `${logPrefix} - Validation failed: Reason is required for disagreement`
          );
          return res
            .status(400)
            .json({ error: "Reason is required for disagreement" });
        }

        // Store reason in documents array
        documents = [reason];
        status = "Payment Not Agreed";
        notificationMessage = `Payment disagreement submitted by ${
          company.companyName || "Vendor"
        } with reason: ${reason}`;
        documentSubmitted = false; // Allow resubmission for agree
        linkUsed = false; // Keep link usable
      } else {
        // Handle agree case
        if (!paymentProofFile) {
          console.error(
            `${logPrefix} - Validation failed: Payment proof document missing`
          );
          return res
            .status(400)
            .json({ error: "Payment proof document is required" });
        }
        if (!paymentProofFile.mimetype.includes("pdf")) {
          console.error(
            `${logPrefix} - Validation failed: Payment proof document is not a PDF`
          );
          return res.status(400).json({ error: "Payment proof must be a PDF" });
        }

        documents = [paymentProofFile.filename];
        documentPath = paymentProofFile.filename;
        status = "Response Received";
        notificationMessage = `Payment proof submitted by ${
          company.companyName || "Vendor"
        }`;
        documentSubmitted = true; // Block further submissions
        linkUsed = true; // Mark link as used
      }

      console.log(`${logPrefix} - Documents to save:`, documents);

      // Update company in the database
      console.log(`${logPrefix} - Updating company in database`);
      let updateSuccess = false;
      for (let i = 0; i < 3; i++) {
        try {
          console.log(`${logPrefix} - Executing UPDATE query with params:`, [
            documentSubmitted,
            documentPath,
            JSON.stringify(documents),
            status,
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            linkUsed,
            companyId,
          ]);
          const [result] = await db.query(
            "UPDATE companies SET documentSubmitted = ?, documentPath = ?, documents = ?, status = ?, lastUpdated = ?, linkUsed = ? WHERE _id = ?",
            [
              documentSubmitted,
              documentPath,
              JSON.stringify(documents),
              status,
              new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
              linkUsed,
              companyId,
            ]
          );
          if (result.affectedRows === 0) {
            console.error(
              `${logPrefix} - No rows updated, possible database mismatch or companyId not found: ${companyId}`
            );
            return res
              .status(500)
              .json({
                error: "Failed to update company data: No rows affected",
              });
          }
          console.log(
            `${logPrefix} - Company updated successfully, affectedRows: ${result.affectedRows}`
          );
          updateSuccess = true;
          break;
        } catch (dbErr) {
          console.warn(
            `${logPrefix} - Database update attempt ${i + 1} failed: ${
              dbErr.message
            }, SQL: ${dbErr.sql || "N/A"}, SQLState: ${dbErr.sqlState || "N/A"}`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!updateSuccess) {
        console.error(`${logPrefix} - Failed to update database after retries`);
        return res
          .status(500)
          .json({
            error: "Failed to update company data: Database update failed",
          });
      }

      // Create notification
      const newNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: agreement === "agree" ? "payment_proof_submitted" : "payment_disagreement",
        companyId: company._id,
        companyName: company.companyName || "Vendor",
        message: notificationMessage,
        documents: documents,
        timestamp: new Date().toISOString(),
        isRead: false,
      };
      console.log(`${logPrefix} - Creating notification:`, newNotification);

      try {
        await saveNotifications(newNotification);
        console.log(`${logPrefix} - Notification saved successfully`);
      } catch (notifErr) {
        console.error(
          `${logPrefix} - Failed to save notification: ${
            notifErr.message
          }, SQL: ${notifErr.sql || "N/A"}, SQLState: ${
            notifErr.sqlState || "N/A"
          }`
        );
      }

      // Emit Socket.IO events
      console.log(`${logPrefix} - Fetching updated company data for Socket.IO`);
      try {
        const [updatedRows] = await db.query(
          "SELECT * FROM companies WHERE _id = ?",
          [companyId]
        );
        io.emit("companyUpdated", updatedRows[0] || {});
        io.emit("newNotification", newNotification);
        console.log(
          `${logPrefix} - Socket.IO events emitted: companyUpdated, newNotification`
        );
      } catch (socketErr) {
        console.error(
          `${logPrefix} - Failed to emit Socket.IO events: ${socketErr.message}`
        );
      }

      console.log(
        `${logPrefix} - ${
          agreement === "agree"
            ? "Payment proof"
            : "Payment disagreement"
        } submission completed successfully`
      );
      return res.status(200).json({
        message: `${
          agreement === "agree"
            ? "Payment proof"
            : "Payment disagreement"
        } submitted successfully`,
      });
    } catch (err) {
      console.error(`${logPrefix} - Error: ${err.message}`);
      if (err instanceof multer.MulterError) {
        return res
          .status(400)
          .json({ error: `File upload error: ${err.message}` });
      }
      return res
        .status(500)
        .json({ error: `Failed to submit: ${err.message}` });
    }
  }
);

app.get("/api/notifications", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) GET /api/notifications`;
  try {
    console.log(`${logPrefix} - Fetching notifications`);
    const [rows] = await db.query(
      "SELECT * FROM notifications ORDER BY timestamp DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res
      .status(500)
      .json({ error: `Failed to fetch notifications: ${err.message}` });
  }
});

app.put("/api/notifications/:id", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) PUT /api/notifications/${req.params.id}`;
  try {
    const notificationId = req.params.id;
    console.log(`${logPrefix} - Updating notification`);

    await db.query("UPDATE notifications SET isRead = TRUE WHERE id = ?", [
      notificationId,
    ]);
    io.emit("notificationUpdated", { id: notificationId, isRead: true });
    console.log(`${logPrefix} - Notification updated successfully`);
    res.status(200).json({ message: "Notification updated successfully" });
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res
      .status(500)
      .json({ error: `Failed to update notification: ${err.message}` });
  }
});

app.get("/api/dashboard-metrics", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) GET /api/dashboard-metrics`;
  try {
    console.log(`${logPrefix} - Fetching dashboard metrics`);

    const [totalCompanies] = await db.query(
      "SELECT COUNT(*) as count FROM companies"
    );
    const [pending] = await db.query(
      "SELECT COUNT(*) as count FROM companies WHERE emailStatus = 'Pending'"
    );
    const [sent] = await db.query(
      "SELECT COUNT(*) as count FROM companies WHERE emailStatus = 'Sent'"
    );
    const [failed] = await db.query(
      "SELECT COUNT(*) as count FROM companies WHERE emailStatus = 'Failed'"
    );
    const [mailViewed] = await db.query(
      "SELECT COUNT(*) as count FROM companies WHERE status = 'Show Mail'"
    );
    const [responded] = await db.query(
      "SELECT COUNT(*) as count FROM companies WHERE documentSubmitted = TRUE"
    );

    const metrics = {
      totalCompanies: totalCompanies[0].count,
      pending: pending[0].count,
      sent: sent[0].count,
      failed: failed[0].count,
      mailViewed: mailViewed[0].count,
      responded: responded[0].count,
    };

    console.log(`${logPrefix} - Dashboard metrics:`, metrics);
    res.json(metrics);
  } catch (err) {
    console.error(
      `${logPrefix} - Error: ${err.message}, SQL: ${
        err.sql || "N/A"
      }, SQLState: ${err.sqlState || "N/A"}`
    );
    res
      .status(500)
      .json({ error: `Failed to fetch dashboard metrics: ${err.message}` });
  }
});

app.post("/api/export-email", async (req, res) => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) POST /api/export-email`;
  try {
    console.log(`${logPrefix} - Exporting email data`);

    const [companies] = await db.query("SELECT * FROM companies");
    const emailData = companies.map((company) => ({
      CompanyName: company.companyName,
      Email: company.email,
      EmailStatus: company.emailStatus,
      EmailSentDate: company.emailSentDate
        ? new Date(company.emailSentDate).toLocaleDateString("en-IN")
        : "N/A",
      LastEmailSent: company.lastEmailSent
        ? new Date(company.lastEmailSent).toLocaleDateString("en-IN")
        : "N/A",
      EmailError: company.emailError || "N/A",
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(emailData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "EmailData");
    const filePath = path.join(__dirname, "email_export.xlsx");
    XLSX.writeFile(workbook, filePath);

    res.download(filePath, "email_export.xlsx", (err) => {
      if (err) {
        console.error(`${logPrefix} - Error sending file: ${err.message}`);
        res
          .status(500)
          .json({ error: `Failed to export email data: ${err.message}` });
      }
      fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error(`${logPrefix} - Error: ${err.message}`);
    res
      .status(500)
      .json({ error: `Failed to export email data: ${err.message}` });
  }
});

// Schedule quarterly reminders
cron.schedule("0 0 * * *", async () => {
  const logPrefix = `(${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })}) Cron /api/send-quarterly-reminders`;
  try {
    console.log(`${logPrefix} - Running quarterly reminders cron job`);
    const response = await fetch(
      "https://fuji.uday.me/api/send-quarterly-reminders",
      { method: "POST" }
    );
    const data = await response.json();
    console.log(`${logPrefix} - Cron job result:`, data);
  } catch (err) {
    console.error(`${logPrefix} - Cron job error: ${err.message}`);
  }
});

// Start the server
const PORT = process.env.PORT || 3003;
initDb().then(() => {
  monitorInbox();
  server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
});
