const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const GridFSBucket = require("mongodb").GridFSBucket;
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/blood_donation",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

const db = mongoose.connection;
let gfsBucket;

db.once("open", () => {
  console.log("Connected to MongoDB");
  gfsBucket = new GridFSBucket(db.db, { bucketName: "uploads" });
});

// GridFS Storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs only
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only images and PDF files are allowed!"), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  createdAt: { type: Date, default: Date.now },
});

// Donor Schema (Blood Ally Registration)
const donorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  branch: { type: String, required: true },
  rollNumber: { type: String, required: true, unique: true },
  bloodGroup: {
    type: String,
    required: true,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  },
  contactInfo: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  lastDonationDate: { type: Date },
  donationHistory: [
    {
      date: { type: Date, default: Date.now },
      location: String,
      units: Number,
    },
  ],
  registeredAt: { type: Date, default: Date.now },
});

// Blood Inventory Schema
const bloodInventorySchema = new mongoose.Schema({
  bloodType: {
    type: String,
    required: true,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    unique: true,
  },
  unitsAvailable: { type: Number, default: 0 },
  donorCount: { type: Number, default: 0 },
  lowStockThreshold: { type: Number, default: 10 },
  lastUpdated: { type: Date, default: Date.now },
});

// Blood Request Schema
const bloodRequestSchema = new mongoose.Schema({
  // Patient Information
  patientName: { type: String, required: true },
  patientAge: { type: Number, required: true },
  bloodTypeNeeded: {
    type: String,
    required: true,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  },
  gender: { type: String, required: true, enum: ["Male", "Female", "Other"] },
  unitsRequired: { type: Number, required: true },
  hospitalName: { type: String, required: true },
  medicalReason: { type: String, required: true },

  // Requester Information
  collegeRollNumber: { type: String, required: true },
  collegeEmail: { type: String, required: true },
  contactNumber: { type: String, required: true },

  // Request Details
  isEmergency: { type: Boolean, default: false },
  hospitalReportsFileId: { type: mongoose.Schema.Types.ObjectId }, // GridFS file ID
  status: {
    type: String,
    enum: ["pending", "approved", "fulfilled", "rejected"],
    default: "pending",
  },

  // Timestamps
  requestedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },

  // Admin Notes
  adminNotes: { type: String },
});

// Notification Schema
const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["emergency_request", "low_stock", "donation_needed"],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  targetAudience: {
    type: String,
    enum: ["all", "admins", "donors"],
    default: "all",
  },
  relatedId: { type: mongoose.Schema.Types.ObjectId }, // Related request/inventory ID
  createdAt: { type: Date, default: Date.now },
});

// Models
const User = mongoose.model("User", userSchema);
const Donor = mongoose.model("Donor", donorSchema);
const BloodInventory = mongoose.model("BloodInventory", bloodInventorySchema);
const BloodRequest = mongoose.model("BloodRequest", bloodRequestSchema);
const Notification = mongoose.model("Notification", notificationSchema);

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "fallback-secret",
    (err, user) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      req.user = user;
      next();
    }
  );
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// Utility Functions
const createNotification = async (type, title, message, relatedId = null) => {
  try {
    const notification = new Notification({
      type,
      title,
      message,
      relatedId,
      targetAudience: type === "low_stock" ? "admins" : "all",
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

const checkLowStock = async () => {
  try {
    const lowStockItems = await BloodInventory.find({
      $expr: { $lt: ["$unitsAvailable", "$lowStockThreshold"] },
    });

    for (const item of lowStockItems) {
      await createNotification(
        "low_stock",
        `Low Stock Alert: ${item.bloodType}`,
        `${item.bloodType} blood type is running low. Current stock: ${item.unitsAvailable} units.`,
        item._id
      );
    }
  } catch (error) {
    console.error("Error checking low stock:", error);
  }
};

// ROUTES

// 1. AUTHENTICATION ROUTES

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      role: role || "user",
    });

    await user.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error registering user", error: error.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback-secret",
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error: error.message });
  }
});

// 2. BLOOD INVENTORY ROUTES

// Get blood inventory
app.get("/api/inventory", async (req, res) => {
  try {
    const inventory = await BloodInventory.find().sort({ bloodType: 1 });
    res.json(inventory);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching inventory", error: error.message });
  }
});

// Update blood inventory (Admin only)
app.put(
  "/api/inventory/:bloodType",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { bloodType } = req.params;
      const { unitsAvailable, donorCount } = req.body;

      let inventory = await BloodInventory.findOne({ bloodType });

      if (!inventory) {
        inventory = new BloodInventory({ bloodType });
      }

      if (unitsAvailable !== undefined)
        inventory.unitsAvailable = unitsAvailable;
      if (donorCount !== undefined) inventory.donorCount = donorCount;
      inventory.lastUpdated = new Date();

      await inventory.save();

      // Check for low stock
      await checkLowStock();

      res.json(inventory);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error updating inventory", error: error.message });
    }
  }
);

// Initialize inventory for all blood types
app.post(
  "/api/inventory/initialize",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

      for (const bloodType of bloodTypes) {
        const existing = await BloodInventory.findOne({ bloodType });
        if (!existing) {
          await BloodInventory.create({
            bloodType,
            unitsAvailable: 0,
            donorCount: 0,
          });
        }
      }

      const inventory = await BloodInventory.find().sort({ bloodType: 1 });
      res.json({ message: "Inventory initialized", inventory });
    } catch (error) {
      res.status(500).json({
        message: "Error initializing inventory",
        error: error.message,
      });
    }
  }
);

// 3. DONOR MANAGEMENT ROUTES

// Register as Blood Ally (Donor Registration)
app.post("/api/donors/register", async (req, res) => {
  try {
    const { name, branch, rollNumber, bloodGroup, contactInfo } = req.body;

    // Check if roll number already exists
    const existingDonor = await Donor.findOne({ rollNumber });
    if (existingDonor) {
      return res
        .status(400)
        .json({ message: "Donor with this roll number already exists" });
    }

    const donor = new Donor({
      name,
      branch,
      rollNumber,
      bloodGroup,
      contactInfo,
    });

    await donor.save();

    // Update donor count in inventory
    await BloodInventory.findOneAndUpdate(
      { bloodType: bloodGroup },
      { $inc: { donorCount: 1 } },
      { upsert: true }
    );

    res.status(201).json({ message: "Donor registered successfully", donor });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error registering donor", error: error.message });
  }
});

// Get all donors (with pagination)
app.get("/api/donors", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const donors = await Donor.find()
      .sort({ registeredAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Donor.countDocuments();

    res.json({
      donors,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: donors.length,
        totalDonors: total,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching donors", error: error.message });
  }
});

// Get donors by blood type
app.get("/api/donors/blood-type/:bloodType", async (req, res) => {
  try {
    const { bloodType } = req.params;
    const donors = await Donor.find({
      bloodGroup: bloodType,
      isAvailable: true,
    });
    res.json(donors);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching donors by blood type",
      error: error.message,
    });
  }
});

// 4. BLOOD REQUEST ROUTES

// Submit blood request
app.post(
  "/api/requests",
  upload.single("hospitalReports"),
  async (req, res) => {
    try {
      const {
        patientName,
        patientAge,
        bloodTypeNeeded,
        gender,
        unitsRequired,
        hospitalName,
        medicalReason,
        collegeRollNumber,
        collegeEmail,
        contactNumber,
        isEmergency,
      } = req.body;

      let hospitalReportsFileId = null;

      // Handle file upload to GridFS
      if (req.file) {
        const uploadStream = gfsBucket.openUploadStream(req.file.originalname, {
          contentType: req.file.mimetype,
        });

        uploadStream.end(req.file.buffer);
        hospitalReportsFileId = uploadStream.id;
      }

      const bloodRequest = new BloodRequest({
        patientName,
        patientAge: parseInt(patientAge),
        bloodTypeNeeded,
        gender,
        unitsRequired: parseInt(unitsRequired),
        hospitalName,
        medicalReason,
        collegeRollNumber,
        collegeEmail,
        contactNumber,
        isEmergency: isEmergency === "true",
        hospitalReportsFileId,
      });

      await bloodRequest.save();

      // Create notification for emergency requests
      if (bloodRequest.isEmergency) {
        await createNotification(
          "emergency_request",
          "Emergency Blood Request",
          `Urgent: ${bloodRequest.unitsRequired} units of ${bloodRequest.bloodTypeNeeded} needed for ${bloodRequest.patientName}`,
          bloodRequest._id
        );
      }

      res.status(201).json({
        message: "Blood request submitted successfully",
        request: bloodRequest,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error submitting request", error: error.message });
    }
  }
);

// Get all blood requests (Admin only)
app.get("/api/requests", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    let query = {};
    if (status && status !== "all") {
      query.status = status;
    }

    const requests = await BloodRequest.find(query)
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BloodRequest.countDocuments(query);

    res.json({
      requests,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: requests.length,
        totalRequests: total,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching requests", error: error.message });
  }
});

// Update request status (Admin only)
app.put(
  "/api/requests/:id/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;

      const request = await BloodRequest.findByIdAndUpdate(
        id,
        {
          status,
          adminNotes,
          updatedAt: new Date(),
        },
        { new: true }
      );

      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      // If approved/fulfilled, update inventory
      if (status === "fulfilled") {
        await BloodInventory.findOneAndUpdate(
          { bloodType: request.bloodTypeNeeded },
          {
            $inc: { unitsAvailable: -request.unitsRequired },
            lastUpdated: new Date(),
          }
        );

        // Check for low stock after fulfilling request
        await checkLowStock();
      }

      res.json(request);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error updating request", error: error.message });
    }
  }
);

// 5. FILE MANAGEMENT ROUTES

// Get uploaded file
app.get("/api/files/:id", authenticateToken, (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);

    gfsBucket.find({ _id: fileId }).toArray((err, files) => {
      if (err || !files || files.length === 0) {
        return res.status(404).json({ message: "File not found" });
      }

      const file = files[0];

      // Set appropriate headers
      res.set({
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="${file.filename}"`,
      });

      // Create download stream
      const downloadStream = gfsBucket.openDownloadStream(fileId);
      downloadStream.pipe(res);
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching file", error: error.message });
  }
});

// 6. NOTIFICATION ROUTES

// Get notifications
app.get("/api/notifications", authenticateToken, async (req, res) => {
  try {
    const { role } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {
      $or: [
        { targetAudience: "all" },
        { targetAudience: role === "admin" ? "admins" : "donors" },
      ],
    };

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments(query);

    res.json({
      notifications,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: notifications.length,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching notifications", error: error.message });
  }
});

// Mark notification as read
app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json(notification);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating notification", error: error.message });
  }
});

// 7. DASHBOARD ROUTES

// Get dashboard stats (Admin only)
app.get(
  "/api/dashboard/stats",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [
        totalDonors,
        totalRequests,
        pendingRequests,
        emergencyRequests,
        lowStockCount,
      ] = await Promise.all([
        Donor.countDocuments(),
        BloodRequest.countDocuments(),
        BloodRequest.countDocuments({ status: "pending" }),
        BloodRequest.countDocuments({
          isEmergency: true,
          status: { $in: ["pending", "approved"] },
        }),
        BloodInventory.countDocuments({
          $expr: { $lt: ["$unitsAvailable", "$lowStockThreshold"] },
        }),
      ]);

      const inventoryStats = await BloodInventory.find().select(
        "bloodType unitsAvailable donorCount"
      );

      res.json({
        totalDonors,
        totalRequests,
        pendingRequests,
        emergencyRequests,
        lowStockCount,
        inventoryStats,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error fetching dashboard stats",
        error: error.message,
      });
    }
  }
);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error:", error);
  res
    .status(500)
    .json({ message: "Internal server error", error: error.message });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not founds" });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
