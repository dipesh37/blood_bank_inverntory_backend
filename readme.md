# Blood Donation Management System - API Documentation

## Base URL

```
http://localhost:5001/api
```

## Authentication

Use postman and use your JWT token which will be created when an admin registers in postman.
Add Authorization in the header section and enter the token as explained below:

```
Authorization: Bearer <your-jwt-token>
```

---

## 1. AUTHENTICATION ENDPOINTS

### Register User

**POST** `/auth/register`

**Body (JSON):**

```json
{
  "email": "dipesh.me.23@nitj.ac.in",
  "password": "password123",
  "role": "admin"
}
```

**Response:**

```json
{
  "message": "User registered successfully"
}
```

### Login

**POST** `/auth/login`

**Body (JSON):**

```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

---

## 2. BLOOD INVENTORY ENDPOINTS

### Get Blood Inventory

**GET** `/inventory`

**Response:**

```json
[
  {
    "_id": "inventory-id",
    "bloodType": "A+",
    "unitsAvailable": 45,
    "donorCount": 45,
    "lowStockThreshold": 10,
    "lastUpdated": "2023-06-09T00:00:00.000Z"
  }
]
```

### Update Blood Inventory (Admin Only)

**PUT** `/inventory/A+`
**Headers:** `Authorization: Bearer <token>`

**Body (JSON):**

```json
{
  "unitsAvailable": 50,
  "donorCount": 50
}
```

### Initialize Inventory (Admin Only)

**POST** `/inventory/initialize`
**Headers:** `Authorization: Bearer <token>`

**Response:** Creates inventory for all blood types (A+, A-, B+, B-, AB+, AB-, O+, O-)

---

## 3. DONOR MANAGEMENT ENDPOINTS

### Register Blood Donor

**POST** `/donors/register`

**Body (JSON):**

```json
{
  "name": "Dipesh Rewar",
  "branch": "ME",
  "rollNumber": "23109034",
  "bloodGroup": "B-",
  "contactInfo": "dipesh.me.23@nitj.ac.in, +1234567890"
}
```

### Get All Donors (with pagination)

**GET** `/donors?page=1&limit=10`

**Response:**

```json
{
  "donors": [
    {
      "_id": "donor-id",
      "name": "Dipesh Rewar",
      "branch": "ME",
      "rollNumber": "23109034",
      "bloodGroup": "B-",
      "contactInfo": "dipesh.me.23@nitj.ac.in, +1234567890",
      "isAvailable": true,
      "registeredAt": "2025-86-09T00:00:00.000Z"
    }
  ],
  "pagination": {
    "current": 1,
    "total": 5,
    "count": 10,
    "totalDonors": 45
  }
}
```

### Get Donors by Blood Type

**GET** `/donors/blood-type/O+`

---

## 4. BLOOD REQUEST ENDPOINTS

### Submit Blood Request

**POST** `/requests`
**Content-Type:** `multipart/form-data`

**Form Data:**

```
patientName: Rohan Sharma
patientAge: 19
bloodTypeNeeded: B-
gender: Male
unitsRequired: 2
hospitalName: City Hospital
medicalReason: Surgery complications
collegeRollNumber: 23109038
collegeEmail: requester@college.edu
contactNumber: +1234567891
isEmergency: true
hospitalReports: [file] (PDF or image)
```

### Get All Blood Requests (Admin Only)

**GET** `/requests?page=1&limit=10&status=pending`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "requests": [
    {
      "_id": "request-id",
      "patientName": "Rohan Sharma",
      "patientAge": 19,
      "bloodTypeNeeded": "B-",
      "gender": "Male",
      "unitsRequired": 2,
      "hospitalName": "City General Hospital",
      "medicalReason": "Surgery complications",
      "collegeRollNumber": "23109038",
      "collegeEmail": "requester@college.edu",
      "contactNumber": "+1234567891",
      "isEmergency": true,
      "hospitalReportsFileId": "file-id",
      "status": "pending",
      "requestedAt": "2025-08-09T00:00:00.000Z",
      "updatedAt": "2025-08-09T00:00:00.000Z"
    }
  ],
  "pagination": {
    "current": 1,
    "total": 3,
    "count": 1,
    "totalRequests": 25
  }
}
```

### Update Request Status (Admin Only)

**PUT** `/requests/<request-id>/status`
**Headers:** `Authorization: Bearer <token>`

**Body (JSON):**

```json
{
  "status": "approved",
  "adminNotes": "Approved - urgent case"
}
```

**Status Options:** `pending`, `approved`, `fulfilled`, `rejected`

---

## 5. FILE MANAGEMENT ENDPOINTS

### Get Uploaded File

**GET** `/files/<file-id>`
**Headers:** `Authorization: Bearer <token>`

**Response:** Returns the actual file (PDF or image)

---

## 6. NOTIFICATION ENDPOINTS

### Get Notifications

**GET** `/notifications?page=1&limit=10`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "notifications": [
    {
      "_id": "notification-id",
      "type": "emergency_request",
      "title": "Emergency Blood Request",
      "message": "Urgent: 2 units of O+ needed for Jane Smith",
      "isRead": false,
      "targetAudience": "all",
      "relatedId": "request-id",
      "createdAt": "2023-06-09T00:00:00.000Z"
    }
  ],
  "pagination": {
    "current": 1,
    "total": 2,
    "count": 1
  }
}
```

### Mark Notification as Read

**PUT** `/notifications/<notification-id>/read`
**Headers:** `Authorization: Bearer <token>`

---

## 7. DASHBOARD ENDPOINTS

### Get Dashboard Stats (Admin Only)

**GET** `/dashboard/stats`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "totalDonors": 150,
  "totalRequests": 75,
  "pendingRequests": 12,
  "emergencyRequests": 3,
  "lowStockCount": 2,
  "inventoryStats": [
    {
      "_id": "inventory-id",
      "bloodType": "A+",
      "unitsAvailable": 45,
      "donorCount": 45
    }
  ]
}
```

---

## TESTING SEQUENCE FOR POSTMAN

### Step 1: Setup Environment

1. Create a new environment in Postman
2. Add variable `base_url` = `http://localhost:5001/api`
3. Add variable `token` (will be set after login)

### Step 2: Authentication Flow

1. **Register Admin:**

   - POST `{{base_url}}/auth/register`
   - Body: `{"email": "admin@test.com", "password": "admin123", "role": "admin"}`

2. **Login:**
   - POST `{{base_url}}/auth/login`
   - Body: `{"email": "admin@test.com", "password": "admin123"}`
   - Copy the token from response and set it in environment variable

### Step 3: Initialize System

1. **Initialize Blood Inventory:**
   - POST `{{base_url}}/inventory/initialize`
   - Headers: `Authorization: Bearer {{token}}`

### Step 4: Test Core Functionality

1. **Register Donors:**

   ```json
   {
     "name": "Dipesh Rewar",
     "branch": "ICE",
     "rollNumber": "23106025",
     "bloodGroup": "O+",
     "contactInfo": "arush@college.edu, +1234567890"
   }
   ```

2. **Submit Blood Request:**

   - Use form-data with all required fields
   - Include a test PDF/image file

3. **Check Inventory:**

   - GET `{{base_url}}/inventory`

4. **View Requests (Admin):**

   - GET `{{base_url}}/requests`

5. **Update Request Status:**
   - PUT `{{base_url}}/requests/<request-id>/status`
   - Body: `{"status": "fulfilled", "adminNotes": "Blood provided"}`

### Step 5: Test Notifications

1. **Get Notifications:**

   - GET `{{base_url}}/notifications`

2. **Dashboard Stats:**
   - GET `{{base_url}}/dashboard/stats`

---

## ERROR RESPONSES

### 400 Bad Request

```json
{
  "message": "User already exists"
}
```

### 401 Unauthorized

```json
{
  "message": "Access token required"
}
```

### 403 Forbidden

```json
{
  "message": "Admin access required"
}
```

### 404 Not Found

```json
{
  "message": "Request not found"
}
```

### 500 Internal Server Error

```json
{
  "message": "Error message here",
  "error": "Detailed error information"
}
```

---

## FILE UPLOAD NOTES

- Maximum file size: 5MB
- Allowed file types: JPEG, PNG, GIF, PDF
- Files are stored in MongoDB GridFS
- Use `multipart/form-data` content type for file uploads
- File field name should be `hospitalReports`

---

## PAGINATION

Most list endpoints support pagination:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

Response includes pagination info:

```json
{
  "pagination": {
    "current": 1,
    "total": 5,
    "count": 10,
    "totalItems": 45
  }
}
```
