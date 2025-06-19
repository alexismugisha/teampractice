// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const crypto = require('crypto'); // For UUID generation

const app = express();
const PORT = process.env.PORT || 3001; // Backend will run on port 3001
const DB_PATH = './database.sqlite'; // SQLite database file will be created here

// Middleware
// Enable CORS for all routes - this is crucial for frontend-backend communication
app.use(cors());
// Body parser for JSON requests. Increasing limit to 5mb to accommodate base64 image data.
app.use(express.json({ limit: '5mb' }));

// Initialize SQLite Database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        // Log error if connection fails
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Serialize ensures commands run sequentially
        db.serialize(() => {
            // Create 'users' table if it doesn't exist
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT DEFAULT 'user'
                )
            `);
            // Create 'products' table if it doesn't exist
            db.run(`
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    price REAL NOT NULL,
                    imageUrl TEXT,
                    userId TEXT NOT NULL,
                    userName TEXT NOT NULL, -- Store user's email as userName for display
                    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            // Create 'orders' table if it doesn't exist
            db.run(`
                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY,
                    productId TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    buyerId TEXT, -- Nullable for guest users
                    buyerEmail TEXT NOT NULL,
                    paymentDetails TEXT NOT NULL,
                    status TEXT DEFAULT 'Pending',
                    orderDate INTEGER NOT NULL, -- Unix timestamp for order placement
                    productUnitPrice REAL NOT NULL, -- Price of product at time of order
                    productImageUrl TEXT, -- Image URL of product at time of order
                    productName TEXT NOT NULL, -- Name of product at time of order
                    guestToken TEXT, -- Unique token for guest orders for tracking
                    FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
                    FOREIGN KEY (buyerId) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            console.log('Database tables checked/created.');

            // Seed a default admin user if no users exist
            const adminEmail = 'admin@example.com';
            const adminPassword = 'adminpassword'; // In production, use strong, environment-variable passwords
            db.get(`SELECT id FROM users WHERE email = ?`, [adminEmail], async (err, row) => {
                if (err) {
                    console.error("Error checking for existing admin user:", err.message);
                    return;
                }
                if (!row) { // If admin user doesn't exist, create it
                    try {
                        const hashedPassword = await bcrypt.hash(adminPassword, 10);
                        const adminId = crypto.randomUUID(); // Generate a unique ID for the admin
                        db.run(`INSERT INTO users (id, email, password, role) VALUES (?, ?, ?, ?)`,
                            [adminId, adminEmail, hashedPassword, 'admin'], (insertErr) => {
                                if (insertErr) {
                                    console.error("Error inserting default admin user:", insertErr.message);
                                } else {
                                    console.log(`Default admin user created: ${adminEmail} (password: ${adminPassword})`);
                                }
                            }
                        );
                    } catch (hashErr) {
                        console.error("Error hashing admin password:", hashErr.message);
                    }
                }
            });
        });
    }
});

// Authentication Middleware
// This middleware extracts the 'User-Id' from the request header.
// It then fetches the corresponding user from the database to attach to req.user.
// This simulates a session-based authentication using a header for simplicity.
const authenticateUser = (req, res, next) => {
    const userId = req.headers['user-id']; // Get user ID from the custom header set by the frontend
    if (!userId) {
        req.user = null; // No user ID means unauthenticated
        return next();
    }

    // Retrieve user details from the database based on the provided user ID
    db.get(`SELECT id, email, role FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err) {
            console.error("Database error during authentication:", err.message);
            return res.status(500).json({ message: "Internal server error during authentication." });
        }
        if (user) {
            // Attach user object to the request for subsequent route handlers
            req.user = { id: user.id, email: user.email, role: user.role };
        } else {
            req.user = null; // User ID not found, treat as unauthenticated
        }
        next(); // Proceed to the next middleware or route handler
    });
};
// Apply authentication middleware to all API routes
app.use('/api', authenticateUser);

// Authorization Middleware
// This middleware checks if the authenticated user has the required role.
const authorizeRole = (requiredRole) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }
    if (req.user.role !== requiredRole) {
        // If user's role does not match the required role, send a 403 Forbidden response
        return res.status(403).json({ message: `Access denied: ${requiredRole} privileges required.` });
    }
    next(); // If authorized, proceed
};

// --- API Routes ---

// @route   POST /api/signup
// @desc    Register a new user account
// @access  Public (can be used by anyone, though frontend might restrict usage for 'admin' role creation)
app.post('/api/signup', async (req, res) => {
    const { email, password, role = 'user' } = req.body; // Default role is 'user'

    // Basic input validation
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    // Ensure only valid roles are assigned
    if (role !== 'user' && role !== 'admin') {
        return res.status(400).json({ message: "Invalid role specified." });
    }

    try {
        // Hash the password before storing it in the database for security
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = crypto.randomUUID(); // Generate a unique ID for the new user

        // Insert new user into the database
        db.run(`INSERT INTO users (id, email, password, role) VALUES (?, ?, ?, ?)`,
            [userId, email, hashedPassword, role],
            function (err) {
                if (err) {
                    // Handle unique email constraint violation
                    if (err.message.includes('UNIQUE constraint failed: users.email')) {
                        return res.status(409).json({ message: "Email already registered." });
                    }
                    console.error("Error signing up user:", err.message);
                    return res.status(500).json({ message: "Error registering user." });
                }
                // Respond with success message and new user details
                res.status(201).json({ message: "User registered successfully.", userId, email, role });
            }
        );
    } catch (error) {
        console.error("Error hashing password during signup:", error.message);
        res.status(500).json({ message: "Internal server error." });
    }
});

// @route   POST /api/login
// @desc    Authenticate user and provide user ID and role
// @access  Public
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    // Retrieve user from database by email
    db.get(`SELECT id, email, password, role FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) {
            console.error("Error fetching user during login:", err.message);
            return res.status(500).json({ message: "Internal server error." });
        }
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        try {
            // Compare provided password with hashed password in database
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ message: "Invalid credentials." });
            }

            // Successfully authenticated, send user ID, email, and role to frontend
            // In a real application, a JWT (JSON Web Token) would typically be generated and sent here
            res.status(200).json({ message: "Logged in successfully.", userId: user.id, email: user.email, role: user.role });
        } catch (error) {
            console.error("Error comparing passwords during login:", error.message);
            res.status(500).json({ message: "Internal server error." });
        }
    });
});

// @route   GET /api/products
// @desc    Get all available products
// @access  Public
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) {
            console.error("Error fetching products:", err.message);
            return res.status(500).json({ message: "Failed to fetch products." });
        }
        res.status(200).json(rows);
    });
});

// @route   GET /api/my-products
// @desc    Get products listed by the authenticated user
// @access  Private (User/Seller)
app.get('/api/my-products', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }

    db.all(`SELECT * FROM products WHERE userId = ?`, [req.user.id], (err, rows) => {
        if (err) {
            console.error("Error fetching user's products:", err.message);
            return res.status(500).json({ message: "Failed to fetch your products." });
        }
        res.status(200).json(rows);
    });
});

// @route   POST /api/products
// @desc    Add a new product to the marketplace
// @access  Private (User/Seller or Admin)
app.post('/api/products', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required to add products." });
    }

    const { name, description, price, imageUrl } = req.body;
    if (!name || !description || !price) {
        return res.status(400).json({ message: "Product name, description, and price are required." });
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
        return res.status(400).json({ message: "Price must be a positive number." });
    }

    const productId = crypto.randomUUID(); // Generate unique ID for the product
    const userId = req.user.id;
    const userName = req.user.email; // Store the email of the user who added the product

    db.run(`INSERT INTO products (id, name, description, price, imageUrl, userId, userName) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [productId, name, description, parseFloat(price), imageUrl, userId, userName],
        function (err) {
            if (err) {
                console.error("Error inserting product:", err.message);
                return res.status(500).json({ message: "Failed to add product." });
            }
            res.status(201).json({ message: "Product added successfully.", productId, name, description, price, imageUrl, userId, userName });
        }
    );
});

// @route   PUT /api/products/:id
// @desc    Update an existing product
// @access  Private (User/Seller who owns the product, or Admin)
app.put('/api/products/:id', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required to update products." });
    }

    const productId = req.params.id;
    const { name, description, price, imageUrl } = req.body;

    if (!name || !description || !price) {
        return res.status(400).json({ message: "Product name, description, and price are required." });
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
        return res.status(400).json({ message: "Price must be a positive number." });
    }

    // First, check if the product exists and if the current user is authorized to update it
    db.get(`SELECT userId FROM products WHERE id = ?`, [productId], (err, product) => {
        if (err) {
            console.error("Error checking product ownership:", err.message);
            return res.status(500).json({ message: "Internal server error." });
        }
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        // Authorization: Only the product owner or an admin can update the product
        if (product.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: "Unauthorized: You do not have permission to update this product." });
        }

        // Perform the update
        db.run(`UPDATE products SET name = ?, description = ?, price = ?, imageUrl = ? WHERE id = ?`,
            [name, description, parseFloat(price), imageUrl, productId],
            function (err) {
                if (err) {
                    console.error("Error updating product:", err.message);
                    return res.status(500).json({ message: "Failed to update product." });
                }
                if (this.changes === 0) {
                    // This indicates the product was found but perhaps no data was changed, or a more subtle error
                    return res.status(404).json({ message: "Product not found or no changes made." });
                }
                res.status(200).json({ message: "Product updated successfully." });
            }
        );
    });
});

// @route   DELETE /api/products/:id
// @desc    Delete a product
// @access  Private (User/Seller who owns the product, or Admin)
app.delete('/api/products/:id', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required to delete products." });
    }

    const productId = req.params.id;

    // First, check if the product exists and if the current user is authorized to delete it
    db.get(`SELECT userId FROM products WHERE id = ?`, [productId], (err, product) => {
        if (err) {
            console.error("Error checking product ownership:", err.message);
            return res.status(500).json({ message: "Internal server error." });
        }
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        // Authorization: Only the product owner or an admin can delete the product
        if (product.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: "Unauthorized: You do not have permission to delete this product." });
        }

        // Perform the delete operation
        db.run(`DELETE FROM products WHERE id = ?`, [productId], function (err) {
            if (err) {
                console.error("Error deleting product:", err.message);
                return res.status(500).json({ message: "Failed to delete product." });
            }
            if (this.changes === 0) {
                // Should not happen if product was found in the GET query, but good for robustness
                return res.status(404).json({ message: "Product not found." });
            }
            res.status(200).json({ message: "Product deleted successfully." });
        });
    });
});

// @route   POST /api/orders
// @desc    Place a new order (can be by authenticated user or guest)
// @access  Public
app.post('/api/orders', (req, res) => {
    const { cartItems, paymentDetails } = req.body;
    // Determine buyer ID and email based on authentication status
    const buyerId = req.user ? req.user.id : null; // Null if it's a guest order
    const buyerEmail = req.user ? req.user.email : paymentDetails; // For guests, paymentDetails acts as their identifier (e.g., email or phone)
    const guestToken = buyerId ? null : crypto.randomUUID(); // Generate a guest token only if it's a guest order

    if (!cartItems || cartItems.length === 0) {
        return res.status(400).json({ message: "Cart is empty. Please add items to checkout." });
    }
    if (!paymentDetails) {
        return res.status(400).json({ message: "Payment email or phone number is required." });
    }

    let successfulOrders = [];
    let failedOrders = [];

    // Process each item in the cart asynchronously
    // Using Promise.all to wait for all order insertions to complete
    const processOrderItems = cartItems.map(item => {
        return new Promise((resolve) => {
            // Fetch product details at the time of order to record accurate price and image
            db.get(`SELECT id, name, price, imageUrl FROM products WHERE id = ?`, [item.productId], (err, product) => {
                if (err) {
                    console.error(`Error fetching product ${item.productId} for order:`, err.message);
                    failedOrders.push({ productId: item.productId, message: "Product not found or database error." });
                    return resolve();
                }
                if (!product) {
                    failedOrders.push({ productId: item.productId, message: "Product not found." });
                    return resolve();
                }

                const orderId = crypto.randomUUID(); // Unique ID for each order line item
                const orderDate = Date.now(); // Current Unix timestamp
                const totalPricePerItem = product.price * item.quantity;

                // Insert order item into the 'orders' table
                db.run(`INSERT INTO orders (id, productId, quantity, buyerId, buyerEmail, paymentDetails, status, orderDate, productUnitPrice, productImageUrl, productName, guestToken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderId,
                        item.productId,
                        item.quantity,
                        buyerId,
                        buyerEmail,
                        paymentDetails,
                        'Pending', // Initial status
                        orderDate,
                        product.price, // Store the unit price at the time of order
                        product.imageUrl, // Store product image URL at time of order
                        product.name, // Store product name at time of order
                        guestToken
                    ],
                    function (insertErr) {
                        if (insertErr) {
                            console.error(`Error inserting order for product ${item.productId}:`, insertErr.message);
                            failedOrders.push({ productId: item.productId, message: "Failed to record order." });
                        } else {
                            successfulOrders.push({
                                orderId,
                                productId: item.productId,
                                productName: product.name,
                                quantity: item.quantity,
                                totalPrice: totalPricePerItem,
                                guestToken: guestToken // Include guest token in successful order response
                            });
                        }
                        resolve(); // Resolve the promise regardless of success or failure for this item
                    }
                );
            });
        });
    });

    // Wait for all order items to be processed
    Promise.all(processOrderItems)
        .then(() => {
            if (successfulOrders.length > 0) {
                res.status(201).json({
                    message: "Order(s) placed successfully.",
                    successfulOrders,
                    failedOrders,
                    guestToken: guestToken // Only relevant if some orders were by guest
                });
            } else {
                // If no items were successfully ordered, send an error
                res.status(400).json({ message: "No items could be ordered. Please check your cart or try again.", failedOrders });
            }
        })
        .catch(error => {
            console.error("Unhandled error during order processing:", error);
            res.status(500).json({ message: "Internal server error during order processing." });
        });
});


// @route   GET /api/my-sales
// @desc    Get sales related to products owned by the authenticated user (seller's view)
// @access  Private (User/Seller or Admin)
app.get('/api/my-sales', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required to view sales." });
    }

    // Join orders with products to filter by the seller's userId
    db.all(`SELECT
                o.id AS orderId,
                o.quantity,
                o.buyerEmail,
                o.paymentDetails,
                o.status,
                o.orderDate,
                o.guestToken,
                p.name AS productName,
                p.price AS productUnitPrice, -- Product price at the time of listing
                o.productUnitPrice AS orderedUnitPrice, -- Price at the time of order
                p.imageUrl AS productImageUrl,
                p.userId AS sellerId,
                p.userName AS sellerName
            FROM orders o
            JOIN products p ON o.productId = p.id
            WHERE p.userId = ?`, // Filter orders where the product's seller is the current user
        [req.user.id],
        (err, rows) => {
            if (err) {
                console.error("Error fetching user's sales:", err.message);
                return res.status(500).json({ message: "Failed to fetch your sales." });
            }
            // Calculate totalPrice for each order item as it's not stored directly as 'totalPrice'
            const salesWithTotalPrice = rows.map(row => ({
                ...row,
                totalPrice: row.quantity * row.orderedUnitPrice // Use orderedUnitPrice for total calculation
            }));
            res.status(200).json(salesWithTotalPrice);
        }
    );
});

// @route   PUT /api/orders/:id/status
// @desc    Update the status of a specific order item
// @access  Private (Seller who owns the product in the order, or Admin)
app.put('/api/orders/:id/status', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required to update order status." });
    }

    const orderId = req.params.id;
    const { status } = req.body;

    // Define valid statuses to prevent arbitrary status updates
    const validStatuses = ['Pending', 'In Progress', 'Completed', 'Cancelled'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid order status provided. Valid statuses are: Pending, In Progress, Completed, Cancelled." });
    }

    // First, verify that the authenticated user is the seller of the product associated with this order
    // or an administrator.
    db.get(`SELECT o.productId, p.userId AS sellerId
            FROM orders o
            JOIN products p ON o.productId = p.id
            WHERE o.id = ?`,
        [orderId],
        (err, row) => {
            if (err) {
                console.error("Error checking order ownership for status update:", err.message);
                return res.status(500).json({ message: "Internal server error." });
            }
            if (!row) {
                return res.status(404).json({ message: "Order not found." });
            }

            // Authorization check
            if (row.sellerId !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ message: "Unauthorized: You do not have permission to update this order's status." });
            }

            // If authorized, proceed to update the order status
            db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId], function (updateErr) {
                if (updateErr) {
                    console.error("Error updating order status:", updateErr.message);
                    return res.status(500).json({ message: "Failed to update order status." });
                }
                if (this.changes === 0) {
                    // This case might mean order not found (already checked), or status was already the same
                    return res.status(404).json({ message: "Order not found or no changes made to status." });
                }
                res.status(200).json({ message: "Order status updated successfully." });
            });
        }
    );
});


// --- Admin-specific Routes (Protected by authorizeRole('admin') middleware) ---

// @route   GET /api/users
// @desc    Get all registered users (admin-only)
// @access  Private (Admin)
app.get('/api/users', authorizeRole('admin'), (req, res) => {
    db.all(`SELECT id, email, role FROM users`, [], (err, rows) => {
        if (err) {
            console.error("Error fetching users for admin:", err.message);
            return res.status(500).json({ message: "Failed to fetch users." });
        }
        res.status(200).json(rows);
    });
});

// @route   PUT /api/users/:id/promote
// @desc    Promote a specific user to admin role (admin-only)
// @access  Private (Admin)
app.put('/api/users/:id/promote', authorizeRole('admin'), (req, res) => {
    const userId = req.params.id;

    // Prevent an admin from attempting to change their own role via this endpoint
    if (userId === req.user.id) {
        return res.status(400).json({ message: "You cannot change your own role through this action." });
    }

    // Update the user's role to 'admin'
    // The `AND role != 'admin'` condition prevents unnecessary updates and helps distinguish outcomes
    db.run(`UPDATE users SET role = 'admin' WHERE id = ? AND role != 'admin'`, [userId], function (err) {
        if (err) {
            console.error("Error promoting user:", err.message);
            return res.status(500).json({ message: "Failed to promote user." });
        }
        if (this.changes === 0) {
            // Check if user was not found or was already an admin
            db.get(`SELECT role FROM users WHERE id = ?`, [userId], (getUserErr, user) => {
                if (getUserErr) return res.status(500).json({ message: "Internal server error." });
                if (!user) return res.status(404).json({ message: "User not found." });
                if (user.role === 'admin') return res.status(200).json({ message: "User is already an admin." });
                return res.status(500).json({ message: "Failed to promote user (no changes made for unknown reason)." });
            });
        } else {
            res.status(200).json({ message: "User promoted to admin successfully." });
        }
    });
});

// @route   DELETE /api/users/:id
// @desc    Delete a specific user account (admin-only)
// @access  Private (Admin)
app.delete('/api/users/:id', authorizeRole('admin'), (req, res) => {
    const userId = req.params.id;

    // Prevent an admin from deleting their own account for safety
    if (userId === req.user.id) {
        return res.status(400).json({ message: "You cannot delete your own account." });
    }

    // Perform the delete operation on the user
    db.run(`DELETE FROM users WHERE id = ?`, [userId], function (err) {
        if (err) {
            console.error("Error deleting user:", err.message);
            return res.status(500).json({ message: "Failed to delete user." });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: "User not found." });
        }
        res.status(200).json({ message: "User deleted successfully." });
    });
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access frontend at http://localhost:5173 (if using default React dev server)`);
    console.log(`API endpoints available at http://localhost:${PORT}/api`);
});
