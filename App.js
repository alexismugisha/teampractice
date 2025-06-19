import React, { useState, useEffect, createContext, useContext, useReducer, useCallback } from 'react';

// --- API Base URL ---
// Make sure this matches the port your Node.js Express backend is running on (default is 3001)
const API_BASE_URL = 'http://localhost:3001/api';

// --- Auth Context and Provider ---
const AuthContext = createContext();

function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = JSON.parse(sessionStorage.getItem('currentUser'));
        const storedRole = sessionStorage.getItem('userRole');

        if (storedUser && storedRole) {
            setCurrentUser(storedUser);
            setUserRole(storedRole);
        }
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        const data = await makeRequest('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        const user = { uid: data.userId, email: data.email };
        setCurrentUser(user);
        setUserRole(data.role);
        sessionStorage.setItem('currentUser', JSON.stringify(user));
        sessionStorage.setItem('userRole', data.role);
        return { success: true, user, role: data.role };
    };

    const signup = async (email, password, role = 'user') => {
        const data = await makeRequest('/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, role }),
        });
        return { success: true, user: { uid: data.userId, email: data.email }, role: data.role };
    };

    const logout = () => {
        setCurrentUser(null);
        setUserRole(null);
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('userRole');
        localStorage.removeItem('cart');
    };

    const value = {
        currentUser,
        userRole,
        loading,
        login,
        signup, // Keep signup for admin use
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

function useAuth() {
    return useContext(AuthContext);
}

// --- Cart Context and Provider ---
const CartContext = createContext();

const cartReducer = (state, action) => {
    switch (action.type) {
        case 'ADD_ITEM':
            const existingItem = state.find(item => item.id === action.payload.id);
            if (existingItem) {
                return state.map(item =>
                    item.id === action.payload.id
                        ? { ...item, quantity: item.quantity + action.payload.quantity }
                        : item
                );
            }
            return [...state, action.payload];
        case 'REMOVE_ITEM':
            return state.filter(item => item.id !== action.payload);
        case 'UPDATE_QUANTITY':
            return state.map(item =>
                item.id === action.payload.id
                    ? { ...item, quantity: action.payload.quantity }
                    : item
            ).filter(item => item.quantity > 0);
        case 'CLEAR_CART':
            return [];
        case 'SET_CART':
            return action.payload;
        default:
            return state;
    }
};

function CartProvider({ children }) {
    const initialCart = JSON.parse(localStorage.getItem('cart')) || [];
    const [cart, dispatch] = useReducer(cartReducer, initialCart);

    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(cart));
    }, [cart]);

    const addItem = (product, quantity = 1) => {
        dispatch({ type: 'ADD_ITEM', payload: { ...product, quantity } });
    };

    const removeItem = (productId) => {
        dispatch({ type: 'REMOVE_ITEM', payload: productId });
    };

    const updateQuantity = (productId, quantity) => {
        dispatch({ type: 'UPDATE_QUANTITY', payload: { id: productId, quantity } });
    };

    const clearCart = () => {
        dispatch({ type: 'CLEAR_CART' });
    };

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const value = {
        cart,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
    };

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}

function useCart() {
    return useContext(CartContext);
}

// --- Reusable UI Components ---

function LoadingSpinner() {
    return (
        <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
            <span className="loading-text">Loading...</span>
        </div>
    );
}

function MessageBox({ message, onClose }) {
    if (!message) return null;
    return (
        <div className="message-box-overlay">
            <div className="message-box-content">
                <p className="message-box-text">{message}</p>
                <button
                    onClick={onClose}
                    className="message-box-button"
                >
                    OK
                </button>
            </div>
        </div>
    );
}

function ConfirmationModal({ isOpen, message, onConfirm, onCancel }) {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <p className="modal-text">{message}</p>
                <div className="modal-actions">
                    <button
                        onClick={onCancel}
                        className="modal-button-cancel"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="modal-button-confirm"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- API Utility for Requests (now handles optional authentication) ---
async function makeRequest(url, options = {}) {
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (user && user.uid) {
        headers['User-Id'] = user.uid;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            let errorData;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                try {
                    errorData = await response.json();
                } catch (jsonError) {
                    errorData = await response.text();
                }
            } else {
                errorData = await response.text();
            }
            throw new Error(errorData.message || `API error (${response.status}): ${typeof errorData === 'string' ? errorData : JSON.stringify(errorData)}`);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : {};
    } catch (error) {
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            throw new Error(`Could not connect to the backend server. Please ensure the backend is running at ${API_BASE_URL}.`);
        }
        throw error;
    }
}


// Login Form (AuthPage) - Modified to be Login ONLY
function AuthPage({ onLoginSuccess }) { // Renamed prop from onSignupSuccess
    const { login } = useAuth(); // Only use login here
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const validateEmail = (email) => {
        if (!email) return "Email is required.";
        if (!/\S+@\S+\.\S/.test(email)) return "Email address is invalid.";
        return "";
    };

    const validatePassword = (password) => {
        if (!password) return "Password is required.";
        if (password.length < 6) return "Password must be at least 6 characters.";
        return "";
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setEmailError('');
        setPasswordError('');

        const emailErr = validateEmail(email);
        const passErr = validatePassword(password);

        if (emailErr || passErr) {
            setEmailError(emailErr);
            setPasswordError(passErr);
            return;
        }

        setIsLoading(true);
        try {
            await login(email, password);
            onLoginSuccess(); // Navigate on successful login
        } catch (error) {
            if (error.message.includes('Could not connect to the backend server')) {
                setMessage(error.message);
            } else if (error.message.includes('Failed to fetch')) {
                setMessage(`Could not connect to the backend server. Please ensure the backend is running at ${API_BASE_URL}.`);
            }
            else {
                setMessage(error.message);
            }
            console.error("Login error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-page-container">
            <div className="auth-card">
                <h2 className="auth-title">Welcome Back!</h2>
                <form onSubmit={handleSubmit} className="auth-form">
                    <div>
                        <label className="auth-label" htmlFor="email">Email Address</label>
                        <div className="auth-input-container">
                            <input
                                type="email"
                                id="email"
                                className={`auth-input ${emailError ? 'input-error' : ''}`}
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                                required
                                placeholder="your.email@example.com"
                            />
                        </div>
                        {emailError && <p className="error-message">{emailError}</p>}
                    </div>
                    <div>
                        <label className="auth-label" htmlFor="password">Password</label>
                        <div className="auth-input-container">
                            <input
                                type="password"
                                id="password"
                                className={`auth-input ${passwordError ? 'input-error' : ''}`}
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                                required
                                placeholder="********"
                            />
                        </div>
                        {passwordError && <p className="error-message">{passwordError}</p>}
                    </div>
                    <button
                        type="submit"
                        className="auth-submit-button"
                        disabled={isLoading}
                    >
                        {isLoading ? <LoadingSpinner /> : (
                            <>
                                <span>Log In</span>
                            </>
                        )}
                    </button>
                </form>
                <MessageBox message={message} onClose={() => setMessage('')} />
            </div>
        </div>
    );
}

// Product Form for Add/Edit
function ProductForm({ product = null, onSave, onCancel }) {
    const [name, setName] = useState(product ? product.name : '');
    const [description, setDescription] = useState(product ? product.description : '');
    const [price, setPrice] = useState(product ? product.price : '');
    const [imageUrl, setImageUrl] = useState(product ? product.imageUrl : `https://placehold.co/400x300/e2e8f0/1a202c?text=Product`);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const [nameError, setNameError] = useState('');
    const [descriptionError, setDescriptionError] = useState('');
    const [priceError, setPriceError] = useState('');
    const [imageError, setImageError] = useState('');

    const validateForm = () => {
        let isValid = true;
        setNameError('');
        setDescriptionError('');
        setPriceError('');
        setImageError('');

        if (!name.trim()) {
            setNameError("Product name is required.");
            isValid = false;
        }
        if (!description.trim()) {
            setDescriptionError("Description is required.");
            isValid = false;
        }
        if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
            setPriceError("Valid price (greater than 0) is required.");
            isValid = false;
        }
        return isValid;
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                setImageError("Please select an image file.");
                setImageUrl('');
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                setImageError("Image file size should not exceed 2MB.");
                setImageUrl('');
                return;
            }

            setImageError('');
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result);
            };
            reader.onerror = () => {
                setImageError("Failed to read image file.");
                setImageUrl('');
            };
            reader.readAsDataURL(file);
        } else {
            setImageUrl('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');

        if (!validateForm()) {
            return;
        }

        setIsLoading(true);
        try {
            await onSave({
                id: product ? product.id : null,
                name,
                description,
                price: parseFloat(price),
                imageUrl: imageUrl || `https://placehold.co/400x300/e2e8f0/1a202c?text=Product`
            });
            if (!product) {
                setName('');
                setDescription('');
                setPrice('');
                setImageUrl(`https://placehold.co/400x300/e2e8f0/1a202c?text=Product`);
            }
        } catch (error) {
            setMessage("Operation failed: " + error.message);
            console.error("Product form error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="product-form-container">
            <h3 className="product-form-title">{product ? 'Edit Product' : 'Add New Product'}</h3>
            <form onSubmit={handleSubmit} className="product-form">
                <div>
                    <label className="product-form-label" htmlFor="product-name">Product Name</label>
                    <input
                        type="text"
                        id="product-name"
                        className={`product-form-input ${nameError ? 'input-error' : ''}`}
                        value={name}
                        onChange={(e) => { setName(e.target.value); setNameError(''); }}
                        required
                    />
                    {nameError && <p className="error-message">{nameError}</p>}
                </div>
                <div>
                    <label className="product-form-label" htmlFor="product-desc">Description</label>
                    <textarea
                        id="product-desc"
                        className={`product-form-input ${descriptionError ? 'input-error' : ''}`}
                        rows="4"
                        value={description}
                        onChange={(e) => { setDescription(e.target.value); setDescriptionError(''); }}
                        required
                    ></textarea>
                    {descriptionError && <p className="error-message">{descriptionError}</p>}
                </div>
                <div>
                    <label className="product-form-label" htmlFor="product-price">Price</label>
                    <input
                        type="number"
                        id="product-price"
                        className={`product-form-input ${priceError ? 'input-error' : ''}`}
                        value={price}
                        onChange={(e) => { setPrice(e.target.value); setPriceError(''); }}
                        step="0.01"
                        required
                    />
                    {priceError && <p className="error-message">{priceError}</p>}
                </div>
                <div>
                    <label className="product-form-label" htmlFor="product-image">Product Image</label>
                    <input
                        type="file"
                        id="product-image"
                        accept="image/*"
                        className="product-form-file-input"
                        onChange={handleFileChange}
                    />
                    {imageError && <p className="error-message">{imageError}</p>}
                    {imageUrl && (
                        <>
                            <img
                                src={imageUrl}
                                alt="Product preview"
                                className="product-form-image-preview"
                                onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/128x128/e2e8f0/1a202c?text=Image+Error`; }}
                            />
                            <p className="product-form-image-hint">
                                (Image is stored as Base64. For production, consider cloud storage for large images.)
                            </p>
                        </>
                    )}
                </div>
                <div className="product-form-actions">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="button-cancel"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="button-save"
                        disabled={isLoading}
                    >
                        {isLoading ? <LoadingSpinner /> : (<> <span>Save Product</span> </>)}
                    </button>
                </div>
            </form>
            <MessageBox message={message} onClose={() => setMessage('')} />
        </div>
    );
}

// User Dashboard (for adding/managing own products and viewing sales)
function Dashboard() {
    const { currentUser } = useAuth();
    const [products, setProducts] = useState([]);
    const [sales, setSales] = useState([]);
    const [showProductForm, setShowProductForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [message, setMessage] = useState('');
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState(null);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [isLoadingSales, setIsLoadingSales] = useState(true);

    const fetchUserProducts = async () => {
        if (!currentUser) return;
        setIsLoadingProducts(true);
        try {
            const data = await makeRequest('/my-products');
            setProducts(data);
        } catch (error) {
            setMessage("Failed to load your products: " + error.message);
            console.error("Error fetching user products:", error);
        } finally {
            setIsLoadingProducts(false);
        }
    };

    const fetchMySales = async () => {
        if (!currentUser) return;
        setIsLoadingSales(true);
        try {
            const data = await makeRequest('/my-sales');
            setSales(data);
        } catch (error) {
            setMessage("Failed to load your sales: " + error.message);
            console.error("Error fetching my sales:", error);
        } finally {
            setIsLoadingSales(false);
        }
    };

    // Fetch data on component mount
    useEffect(() => {
        fetchUserProducts();
        fetchMySales();
    }, [currentUser]); // Depend on currentUser to refetch if user changes

    const handleAddProduct = async (productData) => {
        setIsLoadingProducts(true);
        try {
            await makeRequest('/products', {
                method: 'POST',
                body: JSON.stringify(productData),
            });
            setMessage("Product added successfully!");
            setShowProductForm(false);
            fetchUserProducts(); // Refresh products after adding
        } catch (error) {
            setMessage("Error adding product: " + error.message);
            console.error("Error adding product:", error);
        } finally {
            setIsLoadingProducts(false);
        }
    };

    const handleUpdateProduct = async (productData) => {
        setIsLoadingProducts(true);
        try {
            await makeRequest(`/products/${productData.id}`, {
                method: 'PUT',
                body: JSON.stringify(productData),
            });
            setMessage("Product updated successfully!");
            setEditingProduct(null);
            setShowProductForm(false);
            fetchUserProducts(); // Refresh products after updating
        } catch (error) {
            setMessage("Error updating product: " + error.message);
            console.error("Error updating product:", error);
        } finally {
            setIsLoadingProducts(false);
        }
    };

    const confirmDeleteProduct = (productId) => {
        setProductToDelete(productId);
        setConfirmModalOpen(true);
    };

    const handleDeleteProduct = async () => {
        setIsLoadingProducts(true);
        try {
            await makeRequest(`/products/${productToDelete}`, {
                method: 'DELETE',
            });
            setMessage("Product deleted successfully!");
            fetchUserProducts(); // Refresh products after deleting
            fetchMySales(); // Also refresh sales as a product might have been sold
        } catch (error) {
            setMessage("Error deleting product: " + error.message);
            console.error("Error deleting product:", error);
        } finally {
            setConfirmModalOpen(false);
            setProductToDelete(null);
            setIsLoadingProducts(false);
        }
    };

    const handleUpdateOrderStatus = async (orderId, newStatus) => {
        setIsLoadingSales(true);
        try {
            await makeRequest(`/orders/${orderId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus }),
            });
            setMessage(`Order ${orderId} status updated to ${newStatus}.`);
            fetchMySales(); // Refresh sales after updating status
        } catch (error) {
            setMessage("Error updating order status: " + error.message);
            console.error("Error updating order status:", error);
        } finally {
            setIsLoadingSales(false);
        }
    };

    const startEdit = (product) => {
        setEditingProduct(product);
        setShowProductForm(true);
    };

    const totalProductsCount = products.length;
    const totalSalesRevenue = sales.reduce((sum, order) => sum + order.totalPrice, 0);
    const pendingOrdersCount = sales.filter(order => order.status === 'Pending').length;


    return (
        <div className="dashboard-container">
            <h1 className="dashboard-title">Your Seller Dashboard</h1>
            <p className="dashboard-subtitle">Manage your products and view your sales performance.</p>

            <div className="summary-cards-grid">
                <div className="summary-card primary-gradient">
                    <h3 className="summary-card-title">
                        <span className="summary-card-icon">📦</span> Total Products Listed
                    </h3>
                    <p className="summary-card-value">{totalProductsCount}</p>
                </div>
                <div className="summary-card secondary-gradient">
                    <h3 className="summary-card-title">
                        <span className="summary-card-icon">💰</span> Total Sales Revenue
                    </h3>
                    <p className="summary-card-value">RWF {totalSalesRevenue.toFixed(2)}</p>
                </div>
                <div className="summary-card accent-gradient">
                    <h3 className="summary-card-title">
                        <span className="summary-card-icon">⏳</span> Pending Orders
                    </h3>
                    <p className="summary-card-value">{pendingOrdersCount}</p>
                </div>
            </div>

            <div className="dashboard-section">
                <div className="dashboard-section-header">
                    <h2 className="dashboard-section-title">Your Products for Sale</h2>
                    <div className="dashboard-actions">
                        <button
                            onClick={fetchUserProducts}
                            className="button-blue-solid"
                            disabled={isLoadingProducts}
                        >
                            {isLoadingProducts ? <LoadingSpinner /> : 'Refresh Products'}
                        </button>
                        <button
                            onClick={() => { setShowProductForm(true); setEditingProduct(null); }}
                            className="button-primary"
                            disabled={isLoadingProducts}
                        >
                            {showProductForm || editingProduct ? 'Editing Product...' : (isLoadingProducts ? <LoadingSpinner /> : <> <span>Add New Product</span> </>)}
                        </button>
                    </div>
                </div>

                {(showProductForm || editingProduct) && (
                    <ProductForm
                        product={editingProduct}
                        onSave={editingProduct ? handleUpdateProduct : handleAddProduct}
                        onCancel={() => { setShowProductForm(false); setEditingProduct(null); }}
                    />
                )}

                {isLoadingProducts && !showProductForm ? <LoadingSpinner /> : products.length === 0 ? (
                    <p className="no-items-message">You haven't added any products yet. Click "Add New Product" to get started!</p>
                ) : (
                    <div className="product-grid">
                        {products.map((product, index) => (
                            <div key={product.id} className="product-card animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
                                <img
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="product-card-image"
                                    onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/400x300/e2e8f0/1a202c?text=Image+Not+Found`; }}
                                />
                                <div className="product-card-content">
                                    <h3 className="product-card-title">{product.name}</h3>
                                    <p className="product-card-description">{product.description}</p>
                                    <p className="product-card-price">RWF {product.price.toFixed(2)}</p>
                                    <div className="product-card-actions">
                                        <button
                                            onClick={() => startEdit(product)}
                                            className="button-secondary"
                                        >
                                            <span>Edit</span>
                                        </button>
                                        <button
                                            onClick={() => confirmDeleteProduct(product.id)}
                                            className="button-delete"
                                        >
                                            <span>Delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="dashboard-section">
                <div className="dashboard-section-header">
                    <h2 className="dashboard-section-title">Recent Product Sales</h2>
                    <button
                        onClick={fetchMySales}
                        className="button-blue-solid"
                        disabled={isLoadingSales}
                    >
                        {isLoadingSales ? <LoadingSpinner /> : 'Refresh Sales'}
                    </button>
                </div>
                {isLoadingSales ? <LoadingSpinner /> : sales.length === 0 ? (
                    <p className="no-items-message">No sales yet for your products.</p>
                ) : (
                    <div className="sales-list">
                        {sales.map((order, index) => (
                            <div key={order.orderId} className="sale-item animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
                                <div className="sale-item-details">
                                    <img
                                        src={order.productImageUrl}
                                        alt={order.productName}
                                        className="sale-item-image"
                                        onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/80x80/e2e8f0/1a202c?text=Image+Error`; }}
                                    />
                                    <div className="sale-item-text">
                                        <h3 className="sale-item-product-name">{order.productName}</h3>
                                        <p className="sale-item-info">Qty: {order.quantity} | Unit Price: RWF {order.productUnitPrice.toFixed(2)}</p>
                                        <p className="sale-item-total">Total for this order item: RWF {order.totalPrice.toFixed(2)}</p>
                                        <p className="sale-item-meta">Buyer: <span className="sale-item-meta-value">{order.buyerEmail}</span></p>
                                        <p className="sale-item-meta">Payment Details: <span className="sale-item-meta-value">{order.paymentDetails || 'N/A'}</span></p>
                                        <p className="sale-item-meta">Order Date: {new Date(order.orderDate).toLocaleDateString()} {new Date(order.orderDate).toLocaleTimeString()}</p>
                                        {order.guestToken && <p className="sale-item-meta">Guest Token: <span className="sale-item-meta-value">{order.guestToken.substring(0, 8)}...</span></p>}
                                    </div>
                                </div>
                                <div className="sale-item-status-control">
                                    <span className={`status-badge status-${order.status.toLowerCase().replace(' ', '-')}`}>
                                        Status: {order.status}
                                    </span>
                                    <select
                                        value={order.status}
                                        onChange={(e) => handleUpdateOrderStatus(order.orderId, e.target.value)}
                                        className="status-select"
                                        disabled={isLoadingSales}
                                    >
                                        <option value="Pending">Pending</option>
                                        <option value="In Progress">In Progress</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <MessageBox message={message} onClose={() => setMessage('')} />
            <ConfirmationModal
                isOpen={confirmModalOpen}
                message="Are you sure you want to delete this product? This action cannot be undone."
                onConfirm={handleDeleteProduct}
                onCancel={() => setConfirmModalOpen(false)}
            />
        </div>
    );
}

// Custom hook for debouncing a value
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

// Admin Dashboard
function AdminDashboard() {
    const { currentUser, userRole, signup } = useAuth();
    const [products, setProducts] = useState([]);
    const [users, setUsers] = useState([]);
    const [message, setMessage] = useState('');
    const [productsLoading, setProductsLoading] = useState(true);
    const [usersLoading, setUsersLoading] = useState(true);
    const [showAddUserForm, setShowAddUserForm] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('user'); // Default new user role
    const [newUserEmailError, setNewUserEmailError] = useState('');
    const [newUserPasswordError, setNewUserPasswordError] = useState('');
    const [isAddingUser, setIsAddingUser] = useState(false);

    // Pagination states for Products
    const [productsCurrentPage, setProductsCurrentPage] = useState(1);
    const [productsPerPage] = useState(5);
    const indexOfLastProduct = productsCurrentPage * productsPerPage;
    const indexOfFirstProduct = indexOfLastProduct - productsPerPage;

    // Search state for Products
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const debouncedProductSearchTerm = useDebounce(productSearchTerm, 300); // Debounce search

    const filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(debouncedProductSearchTerm.toLowerCase()) ||
        product.description.toLowerCase().includes(debouncedProductSearchTerm.toLowerCase()) ||
        product.userName.toLowerCase().includes(debouncedProductSearchTerm.toLowerCase()) ||
        product.id.toLowerCase().includes(debouncedProductSearchTerm.toLowerCase())
    );
    const currentFilteredProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);
    const totalProductPages = Math.ceil(filteredProducts.length / productsPerPage);

    // Fetching all products for admin view
    const fetchAllProducts = useCallback(async () => {
        if (!currentUser || userRole !== 'admin') {
            setMessage("Failed to load all products: Admin privileges required. Please log in as an admin.");
            setProductsLoading(false);
            return;
        }
        setProductsLoading(true);
        try {
            const data = await makeRequest('/products');
            setProducts(data);
        } catch (error) {
            const errorMessage = error.message || "Failed to load all products.";
            setMessage("Failed to load all products: " + errorMessage);
            console.error("Error fetching all products:", error);
        } finally {
            setProductsLoading(false);
        }
    }, [currentUser, userRole]);

    // Fetching all users for admin view
    const fetchAllUsers = useCallback(async () => {
        if (!currentUser || userRole !== 'admin') {
            setMessage("Failed to load users: Admin privileges required. Please log in as an admin.");
            setUsersLoading(false);
            return;
        }
        setUsersLoading(true);
        try {
            const data = await makeRequest('/users');
            setUsers(data);
        } catch (error) {
            const errorMessage = error.message || "Failed to load users.";
            setMessage("Failed to load users: " + errorMessage);
            console.error("Error fetching users:", error);
        } finally {
            setUsersLoading(false);
        }
    }, [currentUser, userRole]);

    // Initial data fetch on component mount for Admin
    useEffect(() => {
        if (currentUser && userRole === 'admin') {
            fetchAllProducts();
            fetchAllUsers();
        } else {
            setProducts([]);
            setUsers([]);
            setProductsLoading(false);
            setUsersLoading(false);
            setMessage('');
        }
    }, [currentUser, userRole, fetchAllProducts, fetchAllUsers]);

    const handleAddUser = async (e) => {
        e.preventDefault();
        setMessage('');
        setNewUserEmailError('');
        setNewUserPasswordError('');

        let isValid = true;
        if (!newUserEmail.trim() || !/\S+@\S+\.\S+/.test(newUserEmail)) {
            setNewUserEmailError("Valid email is required.");
            isValid = false;
        }
        if (!newUserPassword.trim() || newUserPassword.length < 6) {
            setNewUserPasswordError("Password must be at least 6 characters.");
            isValid = false;
        }

        if (!isValid) return;

        setIsAddingUser(true);
        try {
            await signup(newUserEmail, newUserPassword, newUserRole);
            setMessage(`User ${newUserEmail} (${newUserRole}) added successfully!`);
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserRole('user');
            setShowAddUserForm(false);
            fetchAllUsers(); // Refresh user list
        } catch (error) {
            setMessage("Error adding user: " + error.message);
            console.error("Error adding user:", error);
        } finally {
            setIsAddingUser(false);
        }
    };

    return (
        <div className="admin-dashboard-container">
            <h1 className="admin-dashboard-title">Admin Dashboard</h1>
            <p className="admin-dashboard-subtitle">Manage products and users. Current Admin: {currentUser?.email || 'N/A'} (UID: {currentUser?.uid})</p>

            <div className="admin-summary-grid">
                <div className="admin-summary-card primary-gradient">
                    <h3 className="admin-summary-card-title">
                        <span className="admin-summary-card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-large"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </span> Total Users
                    </h3>
                    <p className="admin-summary-card-value">{users.length}</p>
                </div>
                <div className="admin-summary-card secondary-gradient">
                    <h3 className="admin-summary-card-title">
                        <span className="admin-summary-card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-large"><path d="M6 2L3 7v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-3-5Z"/><line x1="3" x2="21" y1="7" y2="7"/><path d="M12 18V9"/><path d="m8 13-4 4"/></svg>
                        </span> Total Products
                    </h3>
                    <p className="admin-summary-card-value">{products.length}</p>
                </div>
            </div>

            <div className="admin-section">
                <div className="dashboard-section-header">
                    <h2 className="admin-section-title">
                        <span className="admin-section-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-large"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </span> User Management
                    </h2>
                    <button
                        onClick={() => setShowAddUserForm(!showAddUserForm)}
                        className="button-primary"
                    >
                        {showAddUserForm ? 'Hide Add User Form' : 'Add New User'}
                    </button>
                </div>

                {showAddUserForm && (
                    <div className="admin-add-user-form-container animate-fade-in-down">
                        <h3 className="admin-section-subtitle">Create New User Account</h3>
                        <form onSubmit={handleAddUser} className="admin-form">
                            <div>
                                <label className="admin-label" htmlFor="new-user-email">Email Address</label>
                                <input
                                    type="email"
                                    id="new-user-email"
                                    className={`admin-input ${newUserEmailError ? 'input-error' : ''}`}
                                    value={newUserEmail}
                                    onChange={(e) => { setNewUserEmail(e.target.value); setNewUserEmailError(''); }}
                                    required
                                />
                                {newUserEmailError && <p className="error-message">{newUserEmailError}</p>}
                            </div>
                            <div>
                                <label className="admin-label" htmlFor="new-user-password">Password</label>
                                <input
                                    type="password"
                                    id="new-user-password"
                                    className={`admin-input ${newUserPasswordError ? 'input-error' : ''}`}
                                    value={newUserPassword}
                                    onChange={(e) => { setNewUserPassword(e.target.value); setNewUserPasswordError(''); }}
                                    required
                                />
                                {newUserPasswordError && <p className="error-message">{newUserPasswordError}</p>}
                            </div>
                            <div>
                                <label className="admin-label" htmlFor="new-user-role">Role</label>
                                <select
                                    id="new-user-role"
                                    className="admin-select"
                                    value={newUserRole}
                                    onChange={(e) => setNewUserRole(e.target.value)}
                                >
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                className="button-primary-large"
                                disabled={isAddingUser}
                            >
                                {isAddingUser ? <LoadingSpinner /> : 'Create Account'}
                            </button>
                        </form>
                    </div>
                )}

                {/* Users Table (can be uncommented if needed in the future, for now removed as per prompt) */}
                {/*
                {usersLoading ? <LoadingSpinner /> : filteredUsers.length === 0 ? (
                    <p className="no-items-message">No users found.</p>
                ) : (
                    <div className="admin-table-container">
                        <table className="admin-table">
                            <thead>
                                <tr className="admin-table-header-row">
                                    <th className="admin-table-header">User ID</th>
                                    <th className="admin-table-header">Email</th>
                                    <th className="admin-table-header">Role</th>
                                </tr>
                            </thead>
                            <tbody className="admin-table-body">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="admin-table-row">
                                        <td className="admin-table-cell break-all-word">{user.id}</td>
                                        <td className="admin-table-cell">{user.email}</td>
                                        <td className="admin-table-cell">
                                            <span className={`status-badge status-${user.role}`}>
                                                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                */}
            </div>


            <div className="admin-section">
                <div className="dashboard-section-header">
                    <h2 className="admin-section-title">
                        <span className="admin-section-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-large"><path d="M6 2L3 7v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-3-5Z"/><line x1="3" x2="21" y1="7" y2="7"/><path d="M12 18V9"/><path d="m8 13-4 4"/></svg>
                        </span> All Products Overview
                    </h2>
                    <button
                        onClick={fetchAllProducts}
                        className="button-blue-solid"
                        disabled={productsLoading}
                    >
                        {productsLoading ? <LoadingSpinner /> : 'Refresh Products'}
                    </button>
                </div>
                <div className="admin-search-container">
                    <input
                        type="text"
                        placeholder="Search products by name, description, or user..."
                        className="admin-search-input"
                        value={productSearchTerm}
                        onChange={(e) => {
                            setProductSearchTerm(e.target.value);
                            setProductsCurrentPage(1);
                        }}
                    />
                </div>
                {productsLoading ? <LoadingSpinner /> : filteredProducts.length === 0 ? (
                    <p className="no-items-message">No products found matching your criteria.</p>
                ) : (
                    <>
                        <div className="product-grid">
                            {currentFilteredProducts.map((product, index) => (
                                <div key={product.id} className="admin-product-card animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
                                    <img
                                        src={product.imageUrl}
                                        alt={product.name}
                                        className="admin-product-image"
                                        onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/400x300/e2e8f0/1a202c?text=Image+Not+Found`; }}
                                    />
                                    <div className="admin-product-content">
                                        <h3 className="admin-product-title">{product.name}</h3>
                                        <p className="admin-product-description">{product.description}</p>
                                        <p className="admin-product-price">RWF {product.price.toFixed(2)}</p>
                                        <p className="admin-product-meta">By: {product.userName || 'N/A'} (ID: {product.userId})</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="pagination-controls">
                            {Array.from({ length: totalProductPages }, (_, i) => i + 1).map((number) => (
                                <button
                                    key={number}
                                    onClick={() => setProductsCurrentPage(number)}
                                    className={`pagination-button ${productsCurrentPage === number ? 'active' : ''}`}
                                >
                                    {number}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
            <MessageBox message={message} onClose={() => setMessage('')} />
        </div>
    );
}

// Public Product List (Homepage)
function ProductList() {
    const [products, setProducts] = useState([]);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const { addItem } = useCart();

    const fetchPublicProducts = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/products`);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to fetch products');
            }
            setProducts(data);
        } catch (error) {
            setMessage("Failed to load products: " + error.message);
            console.error("Error fetching public products:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch data only once on component mount
    useEffect(() => {
        fetchPublicProducts();
    }, []); // Empty dependency array means it runs once

    const handleAddToCart = (product) => {
        addItem(product);
        setMessage(`${product.name} added to cart!`);
    };

    return (
        <div className="product-list-container">
            <h1 className="product-list-title">Our Products</h1>
            <p className="product-list-subtitle">Explore a wide range of products from our community.</p>

            {isLoading ? (
                <LoadingSpinner />
            ) : products.length === 0 ? (
                <p className="no-items-message">No products available yet. Check back soon!</p>
            ) : (
                <div className="product-grid">
                    {products.map((product, index) => (
                        <div
                            key={product.id}
                            className="product-list-card"
                            style={{ animationDelay: `${index * 0.1}s` }}
                        >
                            <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="product-list-card-image"
                                onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/400x300/e2e8f0/1a202c?text=Image+Not+Found`; }}
                            />
                            <div className="product-list-card-content">
                                <h3 className="product-list-card-title">{product.name}</h3>
                                <p className="product-list-card-description">{product.description}</p>
                                <p className="product-list-card-price">RWF {product.price.toFixed(2)}</p>
                                <p className="product-list-card-meta">Added by: {product.userName || 'N/A'}</p>
                                <button
                                    onClick={() => handleAddToCart(product)}
                                    className="product-list-add-to-cart-button"
                                >
                                    <span>Add to Cart</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <MessageBox message={message} onClose={() => setMessage('')} />
        </div>
    );
}

// Cart Page Component
function CartPage() {
    const { cart, removeItem, updateQuantity, clearCart, totalPrice } = useCart();
    const { currentUser } = useAuth();
    const [message, setMessage] = useState('');
    const [paymentDetails, setPaymentDetails] = useState('');
    const [paymentDetailsError, setPaymentDetailsError] = useState('');
    const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
    const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
    const [guestOrderToken, setGuestOrderToken] = useState(null);

    const handleQuantityChange = (productId, event) => {
        const quantity = parseInt(event.target.value, 10);
        if (!isNaN(quantity) && quantity > 0) {
            updateQuantity(productId, quantity);
        } else if (quantity === 0) {
            setMessage("Quantity cannot be zero. Use 'Remove' button to delete item.");
        }
    };

    const validatePaymentDetails = (details) => {
        if (!details.trim()) {
            return "Payment email or phone number is required.";
        }
        const emailRegex = /\S+@\S+\.\S+/;
        const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
        if (!emailRegex.test(details) && !phoneRegex.test(details)) {
            return "Please enter a valid email or phone number.";
        }
        return "";
    };

    const confirmCheckout = () => {
        if (cart.length === 0) {
            setMessage("Your cart is empty. Please add items before checking out.");
            return;
        }

        const detailsError = validatePaymentDetails(paymentDetails);
        if (detailsError) {
            setPaymentDetailsError(detailsError);
            return;
        }

        setConfirmCheckoutOpen(true);
    };

    const handleCheckout = async () => {
        setIsProcessingCheckout(true);
        try {
            const orderItems = cart.map(item => ({
                productId: item.id,
                quantity: item.quantity,
            }));

            const response = await makeRequest('/orders', {
                method: 'POST',
                body: JSON.stringify({
                    cartItems: orderItems,
                    paymentDetails: paymentDetails
                }),
            });

            if (response.successfulOrders && response.successfulOrders.length > 0) {
                if (response.guestToken) {
                    setGuestOrderToken(response.guestToken);
                    setMessage(`Order placed successfully as guest! Your order token is: ${response.guestToken}. Please save this for tracking.`);
                } else {
                    setMessage("Order placed successfully! Your cart has been cleared.");
                }
                clearCart();
                setPaymentDetails('');
            } else {
                setMessage(response.message || "Failed to place order.");
            }
        } catch (error) {
            setMessage("Failed to place order: " + error.message);
            console.error("Checkout error:", error);
        } finally {
            setIsProcessingCheckout(false);
            setConfirmCheckoutOpen(false);
        }
    };

    return (
        <div className="cart-page-container">
            <h1 className="cart-page-title">Your Shopping Cart</h1>
            {cart.length === 0 ? (
                <p className="no-items-message">Your cart is empty. Start adding some products!</p>
            ) : (
                <div className="cart-content-wrapper">
                    <div className="cart-items-list">
                        {cart.map((item) => (
                            <div key={item.id} className="cart-item">
                                <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="cart-item-image"
                                    onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/100x100/e2e8f0/1a202c?text=Image+Error`; }}
                                />
                                <div className="cart-item-details">
                                    <h3 className="cart-item-title">{item.name}</h3>
                                    <p className="cart-item-price">RWF {item.price.toFixed(2)}</p>
                                </div>
                                <div className="cart-item-controls">
                                    <label htmlFor={`qty-${item.id}`} className="sr-only">Quantity</label>
                                    <input
                                        type="number"
                                        id={`qty-${item.id}`}
                                        value={item.quantity}
                                        onChange={(e) => { handleQuantityChange(item.id, e); }}
                                        min="1"
                                        className="cart-item-quantity-input"
                                    />
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="cart-item-remove-button"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="cart-checkout-section">
                        <div className="cart-payment-details-form">
                            {!currentUser && (
                                <p className="cart-guest-message">
                                    You are not logged in. You can still proceed as a guest. Please provide your email or phone number to receive order updates.
                                </p>
                            )}
                            <label className="cart-label" htmlFor="payment-details">Payment Email or Phone Number</label>
                            <input
                                type="text"
                                id="payment-details"
                                className={`cart-input ${paymentDetailsError ? 'input-error' : ''}`}
                                placeholder="e.g., your@email.com or +2507XXXXXXXX"
                                value={paymentDetails}
                                onChange={(e) => { setPaymentDetails(e.target.value); setPaymentDetailsError(''); }}
                                required
                            />
                            {paymentDetailsError && <p className="error-message">{paymentDetailsError}</p>}
                        </div>
                        <div className="cart-summary-actions">
                            <h2 className="cart-total">Total: RWF {totalPrice.toFixed(2)}</h2>
                            <button
                                onClick={confirmCheckout}
                                className="button-buy-now"
                                disabled={isProcessingCheckout}
                            >
                                {isProcessingCheckout ? <LoadingSpinner /> : <> <span>Buy Now</span> </>}
                            </button>
                        </div>
                        {guestOrderToken && (
                            <div className="guest-order-token-display">
                                Your Guest Order Token: <strong className="break-words">{guestOrderToken}</strong>
                                <p>Please save this token to track your order.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <MessageBox message={message} onClose={() => { setMessage(''); setGuestOrderToken(null); }} />
            <ConfirmationModal
                isOpen={confirmCheckoutOpen}
                message={`Confirm your purchase${currentUser ? '' : ' as a guest'}?`}
                onConfirm={handleCheckout}
                onCancel={() => setConfirmCheckoutOpen(false)}
            />
        </div>
    );
}

// Updated Presentation Page Component with Software, Hardware, and CCTV focus
function PresentationPage({ onNavigate }) {
    const { currentUser } = useAuth();
    return (
        <div className="presentation-page-container animate-fade-in">
            <div className="hero-section"
                 style={{backgroundImage: `url(https://placehold.co/1200x400/e0e7ff/6366f1?text=Your+Next+Big+Discovery)`}}>
                <div className="hero-overlay"></div>
                <div className="hero-content">
                    <h1 className="hero-title">
                        Discover Something New
                    </h1>
                    <p className="hero-subtitle">
                        Your ultimate destination for unique and high-quality products. Explore, connect, and buy with confidence.
                    </p>
                    <div className="hero-actions">
                        <button
                            onClick={() => onNavigate('products')}
                            className="hero-button-accent"
                        >
                            <span>Explore Products</span>
                        </button>
                        {!currentUser && (
                            <button
                                onClick={() => onNavigate('auth')}
                                className="hero-button-primary"
                            >
                                <span>Login</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="section-container">
                <h2 className="section-title">Why Choose E-Shop?</h2>
                <div className="grid-3-cols">
                    <div className="feature-card">
                        <span className="feature-icon primary-color">✅</span>
                        <h3 className="feature-title">Quality Assurance</h3>
                        <p className="feature-description">Every product is hand-picked to ensure the highest standards.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon secondary-color">🚚</span>
                        <h3 className="feature-title">Global Shipping</h3>
                        <p className="feature-description">We deliver your favorite items right to your doorstep, worldwide.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon accent-color">💳</span>
                        <h3 className="feature-title">Secure Payments</h3>
                        <p className="feature-description">Shop with peace of mind using our encrypted payment gateways.</p>
                    </div>
                </div>
            </div>

            <div className="section-container">
                <h2 className="section-title">Robust Hardware Infrastructure</h2>
                <div className="grid-2-cols">
                    <div className="feature-card text-left-align">
                        <div className="feature-card-header">
                            <span className="feature-icon red-color">☁️</span>
                            <h3 className="feature-title-small">Cloud-Ready Deployment</h3>
                        </div>
                        <p className="feature-description">
                            Our application is designed for seamless deployment on various cloud platforms, leveraging scalable computing resources for high availability.
                        </p>
                    </div>
                    <div className="feature-card text-left-align">
                        <div className="feature-card-header">
                            <span className="feature-icon cyan-color">🌐</span>
                            <h3 className="feature-title-small">Optimized Network Performance</h3>
                        </div>
                        <p className="feature-description">
                            We prioritize efficient network communication, ensuring fast data transfer and minimal latency for a smooth user experience.
                        </p>
                    </div>
                    <div className="feature-card text-left-align">
                        <div className="feature-card-header">
                            <span className="feature-icon gray-700-color">📹</span>
                            <h3 className="feature-title-small">Integrated Monitoring & CCTV</h3>
                        </div>
                        <p className="feature-description">
                            For enhanced security and accountability, our infrastructure supports real-time monitoring through integrated virtual CCTV systems, providing comprehensive oversight of all activities.
                        </p>
                    </div>
                    <div className="feature-card text-left-align">
                        <div className="feature-card-header">
                            <span className="feature-icon blue-800-color"> 層</span>
                            <h3 className="feature-title-small">Future-Proof Architecture</h3>
                        </div>
                        <p className="feature-description">
                            Designed with modularity in mind, our infrastructure can easily incorporate new hardware advancements and security protocols as technology evolves.
                        </p>
                    </div>
                </div>
            </div>

            <div className="section-container">
                <h2 className="section-title">Electronics Services</h2>
                <div className="grid-2-cols">
                    <div className="feature-card text-left-align">
                        <div className="feature-card-header">
                            <span className="feature-icon teal-color">🔧</span>
                            <h3 className="feature-title-small">Expert Repairs & Maintenance</h3>
                        </div>
                        <p className="feature-description">
                            Our certified technicians provide reliable repair and maintenance services for a wide range of electronic devices, ensuring longevity and optimal performance.
                        </p>
                    </div>
                    <div className="feature-card text-left-align">
                        <div className="feature-card-header">
                            <span className="feature-icon indigo-color">💾</span>
                            <h3 className="feature-title-small">Custom Builds & Upgrades</h3>
                        </div>
                        <p className="feature-description">
                            From custom PC builds to electronic device upgrades, we offer tailored solutions to meet your specific needs and enhance performance.
                        </p>
                    </div>
                </div>
            </div>

            <p className="final-cta-text">
                Ready to find your next favorite item?
            </p>
            <button
                onClick={() => onNavigate('products')}
                className="final-cta-button"
            >
                <span>Start Shopping Now!</span>
            </button>
        </div>
    );
}


// Main App Content component
function MainAppContent() {
    const { currentUser, userRole, loading, logout } = useAuth();
    const { totalItems } = useCart();
    const [currentPage, setCurrentPage] = useState('presentation');
    const [message, setMessage] = useState('');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (!loading) {
            if (currentUser) {
                if (userRole === 'admin') {
                    setCurrentPage('admin');
                } else {
                    setCurrentPage('dashboard');
                }
            }
        }
    }, [loading, currentUser, userRole]);

    const handleLogout = () => {
        logout();
        setCurrentPage('auth');
        setMessage("You have been logged out.");
    };

    if (loading) {
        return (
            <div className="app-loading-container">
                <div className="app-loading-text">Loading Application...</div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <nav className="navbar">
                <div className="navbar-inner">
                    <h1 className="navbar-brand">E-Shop</h1>
                    <div className="mobile-menu-button-container">
                        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="mobile-menu-button">
                            <svg className="mobile-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}></path>
                            </svg>
                        </button>
                    </div>
                    <div className={`navbar-menu ${isMobileMenuOpen ? 'is-open' : ''}`}>
                        <button
                            onClick={() => { setCurrentPage('presentation'); setIsMobileMenuOpen(false); }}
                            className="nav-link"
                        >
                            <span>Home</span>
                        </button>
                        <button
                            onClick={() => { setCurrentPage('products'); setIsMobileMenuOpen(false); }}
                            className="nav-link"
                        >
                            <span>Products</span>
                        </button>
                        {currentUser && userRole === 'user' && (
                            <button
                                onClick={() => { setCurrentPage('dashboard'); setIsMobileMenuOpen(false); }}
                                className="nav-link"
                            >
                                <span>My Dashboard</span>
                            </button>
                        )}

                        {currentUser && userRole === 'admin' && (
                            <button
                                onClick={() => { setCurrentPage('admin'); setIsMobileMenuOpen(false); }}
                                className="nav-link"
                            >
                                <span>Admin Panel</span>
                            </button>
                        )}

                        <button
                            onClick={() => { setCurrentPage('cart'); setIsMobileMenuOpen(false); }}
                            className="nav-link cart-link"
                        >
                            <span>Cart</span>
                            {totalItems > 0 && (
                                <span className="cart-badge">
                                    {totalItems}
                                </span>
                            )}
                        </button>

                        {!currentUser ? (
                            <button
                                onClick={() => { setCurrentPage('auth'); setIsMobileMenuOpen(false); }}
                                className="nav-button-login"
                            >
                                <span>Login</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleLogout}
                                className="nav-button-logout"
                            >
                                <span>Logout</span>
                            </button>
                        )}
                    </div>
                </div>
            </nav>

            <main className="app-main-content">
                {(() => {
                    switch (currentPage) {
                        case 'presentation':
                            return <PresentationPage onNavigate={setCurrentPage} />;
                        case 'products':
                            return <ProductList />;
                        case 'dashboard':
                            if (currentUser && userRole === 'user') {
                                return <Dashboard />;
                            } else if (!currentUser) {
                                return <AuthPage onLoginSuccess={() => setCurrentPage('dashboard')} />;
                            } else {
                                setCurrentPage('admin');
                                return <AdminDashboard />;
                            }
                        case 'admin':
                            if (currentUser && userRole === 'admin') {
                                return <AdminDashboard />;
                            } else if (!currentUser) {
                                return <AuthPage onLoginSuccess={() => setCurrentPage('admin')} />;
                            } else {
                                return (
                                    <div className="access-denied-container">
                                        <div className="access-denied-card">
                                            <p className="access-denied-title">Access Denied</p>
                                            <p className="access-denied-message">You must be an admin to view this page.</p>
                                            <button
                                                onClick={() => setCurrentPage('auth')}
                                                className="access-denied-button"
                                            >
                                                Go to Login
                                            </button>
                                        </div>
                                    </div>
                                );
                            }
                        case 'auth':
                            return <AuthPage onLoginSuccess={() => {
                                const user = JSON.parse(sessionStorage.getItem('currentUser'));
                                const role = sessionStorage.getItem('userRole');
                                if (user && role === 'admin') setCurrentPage('admin');
                                else if (user) setCurrentPage('dashboard');
                            }} />;
                        case 'cart':
                            return <CartPage />;
                        default:
                            return <ProductList />;
                    }
                })()}
            </main>

            <Footer />
            <MessageBox message={message} onClose={() => setMessage('')} />
        </div>
    );
}

// New Footer Component
function Footer() {
    const [feedback, setFeedback] = useState('');
    const [feedbackMessage, setFeedbackMessage] = useState('');

    const handleFeedbackSubmit = (e) => {
        e.preventDefault();
        if (feedback.trim()) {
            console.log("Feedback submitted:", feedback);
            setFeedbackMessage("Thank you for your feedback!");
            setFeedback('');
            setTimeout(() => setFeedbackMessage(''), 3000);
        } else {
            setFeedbackMessage("Please enter your feedback.");
        }
    };

    return (
        <footer className="app-footer">
            <div className="footer-container">
                <div>
                    <h3 className="footer-heading">About E-Shop</h3>
                    <p className="footer-text">
                        Your trusted partner for high-quality electronics, software solutions, and comprehensive security systems.
                        We connect you with the best products and services.
                    </p>
                </div>

                <div>
                    <h3 className="footer-heading">Contact Us</h3>
                    <ul className="footer-contact-list">
                        <li className="footer-contact-item">
                            <span>📍 123 Tech Avenue, Kigali, Rwanda</span>
                        </li>
                        <li className="footer-contact-item">
                            <span>📞 +250 788 123 456</span>
                        </li>
                        <li className="footer-contact-item">
                            <span>📧 info@eshop.rw</span>
                        </li>
                    </ul>
                </div>

                <div>
                    <h3 className="footer-heading">Follow Us</h3>
                    <div className="footer-social-links">
                        <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="social-link facebook">
                            Facebook
                        </a>
                        <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="social-link twitter">
                            Twitter
                        </a>
                        <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="social-link instagram">
                            Instagram
                        </a>
                        <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="social-link linkedin">
                            LinkedIn
                        </a>
                    </div>
                </div>

                <div>
                    <h3 className="footer-heading">Send Us Feedback</h3>
                    <form onSubmit={handleFeedbackSubmit} className="footer-feedback-form">
                        <textarea
                            className="feedback-textarea"
                            rows="3"
                            placeholder="Your feedback..."
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                        ></textarea>
                        <button
                            type="submit"
                            className="feedback-submit-button"
                        >
                            <span>Submit Feedback</span>
                        </button>
                        {feedbackMessage && (
                            <p className="feedback-message">{feedbackMessage}</p>
                        )}
                    </form>
                </div>
            </div>
            <div className="footer-bottom-text">
                E-Shop, connecting you to innovation.
            </div>
        </footer>
    );
}

// Main App Component - This is the root component that renders AuthProvider and CartProvider
export default function App() {
    return (
        <AuthProvider>
            <CartProvider>
                <style>
                    {`
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
                    
                    html {
                        scroll-behavior: smooth;
                    }

                    body {
                        font-family: 'Inter', sans-serif;
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                        background-color: #f8fafc;
                        font-size: 16px;
                    }
                    * {
                        box-sizing: border-box;
                    }

                    /* --- Utility Classes --- */
                    .line-clamp-2 {
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    .line-clamp-3 {
                        display: -webkit-box;
                        -webkit-line-clamp: 3;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    .break-words { word-break: break-all; }
                    .break-all-word { word-break: break-all; } /* For long IDs */
                    .center-text { text-align: center; }
                    .font-small { font-size: 0.75rem; } /* text-xs */

                    .search-input-wrapper {
                        position: relative;
                        width: 100%;
                    }
                    .search-input-wrapper .search-icon {
                        position: absolute;
                        left: 0.75rem;
                        top: 50%;
                        transform: translateY(-50%);
                        color: var(--gray-400);
                    }
                    .admin-search-input {
                        padding-left: 2.75rem; /* Adjust padding to make space for the icon */
                    }


                    /* --- Color Palette and Naming Convention --- */
                    :root {
                        /* Backgrounds */
                        --background-main: #f0f9ff;
                        --background-light: #FFFFFF;
                        --background-dark: #e0f2fe;

                        /* Surfaces (cards, forms) */
                        --surface-color: #FFFFFF;

                        /* Text Colors */
                        --text-primary: #1A202C;
                        --text-secondary: #4A5568;
                        --text-tertiary: #718096;

                        /* Primary Action Colors (Blue/Indigo based) */
                        --primary-50: #eef2ff;
                        --primary-300: #93c5fd;
                        --primary-400: #60a5fa;
                        --primary-500: #4299E1;
                        --primary-600: #3B82F6;
                        --primary-700: #2563EB;

                        /* Secondary Action Colors (Green/Teal based) */
                        --secondary-500: #48BB78;
                        --secondary-600: #38A169;
                        --secondary-700: #2F855A;

                        /* Accent Colors (Violet/Purple based) */
                        --accent-50: #f5f3ff;
                        --accent-500: #9F7AEA;
                        --accent-600: #8B5CF6;
                        --accent-700: #7C3AED;
                        --accent-800: #6D28D9;

                        /* Red for errors/danger */
                        --red-500: #EF4444;
                        --red-600: #DC2626;
                        --red-700: #B91C1C;
                        --red-800: #991B1B;

                        /* Yellow/Orange for warnings/pending */
                        --yellow-200: #FEF3C7;
                        --yellow-800: #92400E;

                        /* Blue for info/in progress */
                        --blue-200: #DBEAFE;
                        --blue-600: #2563EB;
                        --blue-700: #1D4ED8;
                        --blue-800: #1E40AF;
                        --blue-500: #3B82F6; /* For social links, matching primary */
                        --blue-400: #60A5FA; /* For social links */

                        /* Purple */
                        --purple-200: #E9D5FF;
                        --purple-500: #A855F7;
                        --purple-600: #9333EA;
                        --purple-800: #6B21A8;

                        /* Cyan */
                        --cyan-600: #0891B2;

                        /* Teal */
                        --teal-600: #0D9488;

                        /* Indigo (for some specific UI elements) */
                        --indigo-600: #4F46E5;

                        /* Gray for borders and secondary elements */
                        --gray-300: #D1D5DB;
                        --gray-400: #9CA3AF;
                        --gray-700: #374151;
                        --gray-800: #1F2937;
                        --gray-900: #111827;

                        /* Border Colors */
                        --border-light: #E2E8F0;
                        --border-medium: #CBD5E0;
                        --border-dark: #A0AEC0;
                    }

                    /* --- General Styling --- */
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 1rem;
                    }

                    @media (min-width: 768px) {
                        .container {
                            padding: 2rem;
                        }
                    }

                    .main-title {
                        font-size: 2.25rem; /* 3xl */
                        font-weight: 800; /* Extra bold */
                        color: var(--text-primary);
                        margin-bottom: 1.5rem;
                        text-align: center;
                    }

                    .subtitle {
                        font-size: 1.25rem; /* xl */
                        color: var(--text-secondary);
                        margin-bottom: 2rem;
                        text-align: center;
                    }

                    /* --- Buttons --- */
                    .button-base {
                        padding: 0.625rem 1.25rem; /* py-2 px-5 */
                        border-radius: 0.5rem; /* rounded-lg */
                        font-weight: 600; /* Semi bold */
                        transition: all 0.3s ease; /* transition duration-300 */
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); /* shadow-md */
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.5rem;
                        cursor: pointer;
                        border: none;
                        text-decoration: none;
                        transform: translateY(0);
                    }

                    .button-base:hover {
                        transform: translateY(-0.125rem); /* hover:-translate-y-0.5 */
                    }
                    
                    .button-base:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                        transform: translateY(0); /* Disable hover effect */
                        box-shadow: none;
                    }

                    .button-primary {
                        background-color: var(--primary-600);
                        color: white;
                    }
                    .button-primary:hover {
                        background-color: var(--primary-700);
                    }

                    .button-secondary {
                        background-color: var(--secondary-500);
                        color: white;
                    }
                    .button-secondary:hover {
                        background-color: var(--secondary-600);
                    }

                    .button-accent {
                        background-color: var(--accent-600);
                        color: white;
                    }
                    .button-accent:hover {
                        background-color: var(--accent-700);
                    }
                    .button-accent:active {
                        background-color: var(--accent-800);
                    }

                    .button-delete {
                        background-color: var(--red-600);
                        color: white;
                    }
                    .button-delete:hover {
                        background-color: var(--red-700);
                    }

                    .button-cancel {
                        background-color: var(--gray-300);
                        color: var(--gray-800);
                    }
                    .button-cancel:hover {
                        background-color: var(--gray-400);
                    }

                    .button-blue-solid {
                        background-color: var(--blue-600);
                        color: white;
                        padding: 0.625rem 1.25rem;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.3s ease;
                    }
                    .button-blue-solid:hover {
                        background-color: var(--blue-700);
                        transform: translateY(-0.125rem);
                    }

                    .button-purple {
                        background-color: var(--purple-500);
                        color: white;
                        padding: 0.5rem 1rem;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        font-size: 0.875rem; /* text-sm */
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.3s ease;
                        transform: translateY(0);
                    }
                    .button-purple:hover {
                        background-color: var(--purple-600);
                        transform: translateY(-0.125rem);
                    }
                    .button-purple:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                        transform: translateY(0);
                        box-shadow: none;
                    }

                    .button-buy-now {
                        padding: 0.75rem 1.5rem; /* px-6 py-3 */
                        background-color: var(--secondary-600);
                        color: white;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); /* shadow-lg */
                        transition: all 0.3s ease;
                        transform: translateY(0);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.5rem;
                        cursor: pointer;
                        border: none;
                    }
                    .button-buy-now:hover {
                        background-color: var(--secondary-700);
                        transform: translateY(-0.125rem);
                    }
                    .button-buy-now:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                        transform: translateY(0);
                        box-shadow: none;
                    }
                    
                    .button-primary-large {
                        padding: 0.875rem 1.5rem; /* px-6 py-3.5 */
                        background-color: var(--primary-600);
                        color: white;
                        border-radius: 0.5rem;
                        font-weight: 700; /* font-bold */
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); /* shadow-lg */
                        transition: all 0.3s ease;
                        transform: translateY(0);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.5rem;
                        cursor: pointer;
                        border: none;
                        background: linear-gradient(to right, var(--primary-600), var(--primary-700));
                    }
                    .button-primary-large:hover {
                        background: linear-gradient(to right, var(--primary-700), var(--primary-800));
                        transform: translateY(-0.125rem);
                    }
                    .button-primary-large:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                        transform: translateY(0);
                        box-shadow: none;
                    }

                    /* --- Inputs/Selects/Textareas --- */
                    .input-base {
                        width: 100%;
                        padding: 0.75rem 1.25rem; /* px-5 py-3 */
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem; /* rounded-lg */
                        transition: all 0.2s ease; /* transition duration-300 */
                        color: var(--text-primary);
                        font-size: 1rem; /* text-base */
                    }
                    .input-base:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500); /* focus:ring-2 focus:ring-accent-500 */
                    }
                    .input-error {
                        border-color: var(--red-500);
                        box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3); /* ring-red-300 */
                    }
                    .error-message {
                        color: var(--red-600);
                        font-size: 0.75rem; /* text-xs */
                        margin-top: 0.25rem;
                        font-weight: 500; /* font-medium */
                    }

                    /* --- Loading Spinner --- */
                    .loading-spinner-container {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .loading-spinner {
                        border: 0.125rem solid transparent; /* border-b-2 */
                        border-top-color: var(--primary-600); /* border-primary-600 */
                        border-radius: 50%;
                        width: 2rem; /* h-8 w-8 */
                        height: 2rem;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .loading-text {
                        margin-left: 0.75rem; /* ml-3 */
                        color: var(--gray-700);
                    }

                    /* --- MessageBox & Modal --- */
                    .message-box-overlay, .modal-overlay {
                        position: fixed;
                        inset: 0; /* inset-0 */
                        background-color: rgba(17, 24, 39, 0.7); /* bg-gray-900 bg-opacity-70 */
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 1rem;
                        z-index: 50;
                    }
                    .message-box-content, .modal-content {
                        background-color: white;
                        padding: 1.5rem; /* p-6 */
                        border-radius: 1rem; /* rounded-xl */
                        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); /* shadow-2xl */
                        max-width: 24rem; /* max-w-sm */
                        width: 100%;
                        text-align: center;
                    }
                    .message-box-content {
                        border-top: 0.25rem solid var(--accent-500); /* border-t-4 border-accent-500 */
                    }
                    .modal-content {
                        border-top: 0.25rem solid var(--red-500); /* border-t-4 border-red-500 */
                    }
                    .message-box-text, .modal-text {
                        font-size: 1.125rem; /* lg */
                        font-weight: 600; /* semi-bold */
                        margin-bottom: 1rem; /* mb-4 */
                        color: var(--gray-800);
                    }
                    .message-box-button {
                        padding: 0.5rem 1.5rem; /* px-6 py-2 */
                        background-color: var(--accent-600);
                        color: white;
                        border-radius: 0.5rem; /* rounded-lg */
                        font-weight: 500; /* font-medium */
                        font-size: 0.875rem; /* text-sm */
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                        transition: background-color 0.3s ease;
                    }
                    .message-box-button:hover {
                        background-color: var(--accent-700);
                    }
                    .modal-actions {
                        display: flex;
                        justify-content: center;
                        gap: 1rem; /* space-x-4 */
                    }
                    .modal-button-cancel {
                        padding: 0.5rem 1.5rem;
                        background-color: var(--gray-300);
                        color: var(--gray-800);
                        border-radius: 0.5rem;
                        font-weight: 500;
                        transition: background-color 0.3s ease;
                    }
                    .modal-button-cancel:hover {
                        background-color: var(--gray-400);
                    }
                    .modal-button-confirm {
                        padding: 0.5rem 1.5rem;
                        background-color: var(--red-600);
                        color: white;
                        border-radius: 0.5rem;
                        font-weight: 500;
                        transition: background-color 0.3s ease;
                    }
                    .modal-button-confirm:hover {
                        background-color: var(--red-700);
                    }

                    /* --- AuthPage Specifics --- */
                    .auth-page-container {
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: linear-gradient(to bottom right, var(--background-light), var(--background-dark));
                        padding: 1rem;
                    }
                    .auth-card {
                        background-color: var(--surface-color);
                        padding: 2rem;
                        border-radius: 1rem;
                        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                        width: 100%;
                        max-width: 28rem;
                        border: 1px solid var(--border-light);
                    }
                    .auth-title {
                        font-size: 2.25rem;
                        font-weight: 800;
                        color: var(--text-primary);
                        margin-bottom: 1.5rem;
                        text-align: center;
                        letter-spacing: -0.025em; /* tracking-tight */
                    }
                    .auth-form {
                        display: flex;
                        flex-direction: column;
                        gap: 1.25rem; /* space-y-5 */
                    }
                    .auth-label {
                        display: block;
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        font-weight: 600;
                        margin-bottom: 0.5rem;
                    }
                    .auth-input-container {
                        position: relative;
                    }
                    .auth-input {
                        width: 100%;
                        padding: 0.75rem 1rem; /* px-5 py-3 pl-4 */
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem;
                        transition: all 0.2s ease;
                        color: var(--text-primary);
                        font-size: 1rem;
                    }
                    .auth-input:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500);
                    }
                    .auth-submit-button {
                        width: 100%;
                        background-color: var(--accent-600);
                        color: white;
                        padding: 0.875rem 0; /* py-3.5 */
                        border-radius: 0.5rem;
                        font-weight: 700;
                        font-size: 1.125rem; /* text-lg */
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                        transition: all 0.3s ease;
                        transform: translateY(0);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.5rem;
                        cursor: pointer;
                        border: none;
                    }
                    .auth-submit-button:hover {
                        background-color: var(--accent-700);
                        transform: translateY(-0.125rem);
                    }
                    .auth-submit-button:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                        transform: translateY(0);
                        box-shadow: none;
                    }
                    .auth-toggle-container {
                        margin-top: 1.5rem;
                        text-align: center;
                    }
                    .auth-toggle-button {
                        color: var(--primary-600);
                        font-weight: 600;
                        font-size: 0.875rem;
                        transition: color 0.3s ease;
                        background: none;
                        border: none;
                        cursor: pointer;
                        text-decoration: none;
                    }
                    .auth-toggle-button:hover {
                        color: var(--primary-700);
                    }

                    /* --- ProductForm Specifics --- */
                    .product-form-container {
                        padding: 1.5rem;
                        background-color: var(--surface-color);
                        border-radius: 1rem;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                        margin-bottom: 1.5rem;
                        border: 1px solid var(--border-light);
                    }
                    .product-form-title {
                        font-size: 1.875rem;
                        font-weight: 700;
                        color: var(--text-primary);
                        margin-bottom: 1.25rem;
                    }
                    .product-form {
                        display: flex;
                        flex-direction: column;
                        gap: 1.25rem;
                    }
                    .product-form-label {
                        display: block;
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        font-weight: 600;
                        margin-bottom: 0.5rem;
                    }
                    .product-form-input {
                        width: 100%;
                        padding: 0.75rem 1.25rem;
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem;
                        transition: all 0.2s ease;
                    }
                    .product-form-input:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500);
                    }
                    .product-form-file-input {
                        width: 100%;
                        padding: 0.75rem 1.25rem;
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem;
                        transition: all 0.2s ease;
                        background-color: white; /* Ensure consistent background */
                    }
                    .product-form-file-input:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500);
                    }
                    .product-form-image-preview {
                        margin-top: 0.75rem;
                        width: 8rem; /* w-32 */
                        height: 8rem; /* h-32 */
                        object-fit: cover;
                        border-radius: 0.5rem;
                        border: 1px solid var(--border-medium);
                        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                    }
                    .product-form-image-hint {
                        color: var(--text-tertiary);
                        font-size: 0.75rem;
                        margin-top: 0.5rem;
                    }
                    .product-form-actions {
                        display: flex;
                        justify-content: flex-end;
                        gap: 0.75rem; /* space-x-3 */
                        padding-top: 1rem;
                    }

                    /* --- Dashboard Specifics --- */
                    .dashboard-container {
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 1rem;
                        background-color: var(--background-main);
                        min-height: 100vh;
                    }

                    @media (min-width: 768px) {
                        .dashboard-container {
                            padding: 2rem;
                        }
                    }

                    .dashboard-title {
                        font-size: 2.25rem;
                        font-weight: 800;
                        color: var(--text-primary);
                        margin-bottom: 1.5rem;
                        text-align: center;
                    }
                    .dashboard-subtitle {
                        font-size: 1.25rem;
                        color: var(--text-secondary);
                        margin-bottom: 2rem;
                        text-align: center;
                    }

                    .summary-cards-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                        margin-bottom: 3rem; /* mb-12 */
                    }
                    @media (min-width: 640px) { /* sm */
                        .summary-cards-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    @media (min-width: 1024px) { /* lg */
                        .summary-cards-grid {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }

                    .summary-card {
                        padding: 1.5rem;
                        border-radius: 1rem;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                        color: white;
                        text-align: center;
                        transition: all 0.3s ease;
                        transform: scale(1);
                    }
                    .summary-card:hover {
                        transform: scale(1.05);
                    }
                    .summary-card-title {
                        font-size: 1.125rem;
                        font-weight: 600;
                        margin-bottom: 0.5rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .summary-card-icon {
                        margin-right: 0.5rem;
                        font-size: 1.875rem; /* 3xl */
                    }
                    .summary-card-value {
                        font-size: 3rem; /* 5xl */
                        font-weight: 700;
                    }

                    .dashboard-section {
                        background-color: var(--surface-color);
                        padding: 1.5rem;
                        border-radius: 1rem;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                        margin-bottom: 3rem;
                        border: 1px solid var(--border-light);
                    }
                    .dashboard-section-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 1.5rem;
                        flex-wrap: wrap; /* Allow wrapping on smaller screens */
                        gap: 1rem; /* Space between elements */
                    }
                    .dashboard-actions {
                        display: flex;
                        gap: 0.75rem; /* Space between buttons */
                        flex-wrap: wrap;
                    }
                    .dashboard-section-title {
                        font-size: 1.875rem;
                        font-weight: 700;
                        color: var(--text-primary);
                    }
                    .no-items-message {
                        color: var(--text-secondary);
                        font-size: 1.125rem;
                        text-align: center;
                        padding-top: 1rem;
                        padding-bottom: 1rem;
                    }

                    .product-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                    }
                    @media (min-width: 768px) { /* md */
                        .product-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    @media (min-width: 1024px) { /* lg */
                        .product-grid {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }

                    .product-card {
                        background-color: var(--background-light);
                        border-radius: 0.75rem;
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                        overflow: hidden;
                        border: 1px solid var(--border-light);
                        transition: all 0.3s ease;
                        transform: translateY(0);
                    }
                    .product-card:hover {
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); /* hover:shadow-xl */
                        transform: translateY(-0.25rem); /* hover:-translate-y-1 */
                    }
                    .product-card-image {
                        width: 100%;
                        height: 12rem; /* h-48 */
                        object-fit: cover;
                        object-position: center;
                    }
                    .product-card-content {
                        padding: 1.25rem; /* p-5 */
                    }
                    .product-card-title {
                        font-size: 1.25rem;
                        font-weight: 700;
                        color: var(--text-primary);
                        margin-bottom: 0.5rem;
                    }
                    .product-card-description {
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        margin-bottom: 0.75rem;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    .product-card-price {
                        color: var(--primary-700);
                        font-weight: 800;
                        font-size: 1.125rem;
                        margin-bottom: 1rem;
                    }
                    .product-card-actions {
                        display: flex;
                        gap: 0.75rem;
                    }
                    .product-card-actions .button-secondary,
                    .product-card-actions .button-delete {
                        flex: 1;
                        padding: 0.5rem 1rem; /* px-4 py-2 */
                        font-size: 0.875rem;
                    }


                    .sales-list {
                        display: flex;
                        flex-direction: column;
                        gap: 1.5rem;
                    }
                    .sale-item {
                        background-color: var(--background-light);
                        padding: 1.5rem;
                        border-radius: 0.75rem;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        border: 1px solid var(--border-medium);
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 1rem;
                        transition: all 0.3s ease;
                        transform: scale(1);
                    }
                    .sale-item:hover {
                        transform: scale(1.03);
                    }
                    @media (min-width: 768px) { /* md */
                        .sale-item {
                            flex-direction: row;
                            justify-content: space-between;
                        }
                    }
                    .sale-item-details {
                        display: flex;
                        align-items: center;
                        width: 100%;
                    }
                    @media (min-width: 768px) { /* md */
                        .sale-item-details {
                            width: auto;
                        }
                    }
                    .sale-item-image {
                        width: 6rem; /* w-24 */
                        height: 6rem; /* h-24 */
                        object-fit: cover;
                        border-radius: 0.5rem;
                        margin-right: 1rem;
                        margin-bottom: 1rem;
                        border: 1px solid var(--border-medium);
                        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                    }
                    @media (min-width: 640px) { /* sm */
                        .sale-item-image {
                            margin-bottom: 0;
                        }
                    }
                    .sale-item-text {
                        text-align: center;
                        flex-grow: 1;
                    }
                    @media (min-width: 640px) { /* sm */
                        .sale-item-text {
                            text-align: left;
                        }
                    }
                    .sale-item-product-name {
                        font-size: 1.125rem;
                        font-weight: 600;
                        color: var(--text-primary);
                    }
                    .sale-item-info {
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                    }
                    .sale-item-total {
                        color: var(--primary-700);
                        font-weight: 800;
                        font-size: 1rem;
                    }
                    .sale-item-meta {
                        color: var(--text-tertiary);
                        font-size: 0.75rem;
                        margin-top: 0.25rem;
                    }
                    .sale-item-meta-value {
                        font-weight: 500;
                        color: var(--text-secondary);
                    }
                    .sale-item-status-control {
                        width: 100%;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 0.5rem;
                    }
                    @media (min-width: 768px) { /* md */
                        .sale-item-status-control {
                            width: auto;
                            align-items: flex-end;
                        }
                    }
                    .status-badge {
                        padding: 0.25rem 1rem; /* px-4 py-1.5 */
                        border-radius: 9999px; /* rounded-full */
                        font-size: 0.875rem;
                        font-weight: 700;
                        width: 100%;
                        text-align: center;
                    }
                    .status-pending {
                        background-color: var(--yellow-200);
                        color: var(--yellow-800);
                    }
                    .status-in-progress {
                        background-color: var(--blue-200);
                        color: var(--blue-800);
                    }
                    .status-completed {
                        background-color: var(--secondary-600); /* Use secondary-600 (green) directly for completed */
                        color: white;
                    }
                    .status-cancelled {
                        background-color: var(--red-200);
                        color: var(--red-800);
                    }
                    .status-select {
                        margin-top: 0.5rem;
                        padding: 0.5rem;
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem;
                        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                        width: 100%;
                        min-width: 150px;
                        transition: all 0.2s ease;
                    }
                    .status-select:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500);
                    }
                    @media (min-width: 768px) { /* md */
                        .status-select {
                            width: auto;
                        }
                    }

                    /* --- AdminDashboard Specifics --- */
                    .admin-dashboard-container {
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 1rem;
                        background-color: var(--background-main);
                        min-height: 100vh;
                    }
                    @media (min-width: 768px) {
                        .admin-dashboard-container {
                            padding: 2rem;
                        }
                    }
                    .admin-dashboard-title {
                        font-size: 2.25rem;
                        font-weight: 800;
                        color: var(--text-primary);
                        margin-bottom: 1.5rem;
                        text-align: center;
                    }
                    .admin-dashboard-subtitle {
                        font-size: 1.25rem;
                        color: var(--text-secondary);
                        margin-bottom: 2rem;
                        text-align: center;
                    }
                    .admin-summary-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                        margin-bottom: 2rem;
                    }
                    @media (min-width: 768px) {
                        .admin-summary-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    @media (min-width: 1024px) {
                        .admin-summary-grid {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }
                    .admin-summary-card {
                        padding: 1.5rem;
                        border-radius: 1rem;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                        color: white;
                        text-align: center;
                        transition: all 0.3s ease;
                        transform: scale(1);
                    }
                    .admin-summary-card:hover {
                        transform: scale(1.05);
                    }
                    .admin-summary-card-title {
                        font-size: 1.125rem;
                        font-weight: 600;
                        margin-bottom: 0.5rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .admin-summary-card-icon {
                        margin-right: 0.5rem;
                        font-size: 1.875rem;
                    }
                    .admin-section {
                        background-color: var(--surface-color);
                        padding: 1.5rem;
                        border-radius: 1rem;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                        margin-bottom: 2rem;
                        border: 1px solid var(--border-light);
                    }
                    .admin-section-title {
                        font-size: 1.875rem;
                        font-weight: 700;
                        color: var(--text-primary);
                        margin-bottom: 1.25rem;
                        display: flex;
                        align-items: center;
                    }
                    .admin-section-icon {
                        margin-right: 0.75rem;
                        font-size: 2.25rem; /* 4xl */
                    }
                    .admin-form {
                        display: flex;
                        flex-direction: column;
                        gap: 1.25rem;
                    }
                    .admin-label {
                        display: block;
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        font-weight: 600;
                        margin-bottom: 0.5rem;
                    }
                    .admin-input-container, .admin-select-container {
                        position: relative;
                    }
                    .admin-input, .admin-select {
                        width: 100%;
                        padding: 0.75rem 1.25rem;
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem;
                        transition: all 0.2s ease;
                        color: var(--text-primary);
                        font-size: 1rem;
                    }
                    .admin-input:focus, .admin-select:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500);
                    }
                    .admin-select {
                        appearance: none; /* Remove default arrow */
                    }
                    .admin-add-user-form-container {
                        padding: 1rem;
                        background-color: var(--primary-50);
                        border-radius: 0.75rem;
                        margin-top: 1.5rem;
                        margin-bottom: 1.5rem;
                        border: 1px dashed var(--primary-300);
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    }
                    .admin-section-subtitle {
                        font-size: 1.5rem;
                        font-weight: 600;
                        color: var(--text-primary);
                        margin-bottom: 1rem;
                        text-align: center;
                    }

                    .admin-search-container {
                        margin-bottom: 1.25rem;
                    }
                    .admin-search-input {
                        width: 100%;
                        padding: 0.75rem 1.25rem;
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem;
                        transition: all 0.2s ease;
                    }
                    .admin-search-input:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500);
                    }

                    .admin-table-container {
                        overflow-x: auto;
                        border-radius: 0.5rem;
                        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                        border: 1px solid var(--border-light);
                    }
                    .admin-table {
                        min-width: 100%; /* min-w-full */
                        background-color: var(--surface-color);
                        border-collapse: collapse; /* Ensure no double borders */
                    }
                    .admin-table-header-row {
                        background-color: var(--background-light);
                        color: var(--text-secondary);
                        text-transform: uppercase;
                        font-size: 0.875rem;
                        line-height: 1.25rem;
                    }
                    .admin-table-header {
                        padding: 0.75rem 1.5rem;
                        text-align: left;
                    }
                    .admin-table-body {
                        color: var(--text-secondary);
                        font-size: 1rem;
                        font-weight: 300;
                    }
                    .admin-table-row {
                        transition: background-color 0.15s ease;
                    }
                    .admin-table-row:hover {
                        background-color: var(--background-light);
                    }
                    .admin-table-cell {
                        padding: 1rem 1.5rem;
                        text-align: left;
                        white-space: nowrap;
                        border-bottom: 1px solid var(--border-light);
                    }
                    .admin-table-cell:last-child {
                        border-right: none;
                    }
                    .admin-table-body .admin-table-row:last-child .admin-table-cell {
                        border-bottom: none;
                    }


                    .pagination-controls {
                        display: flex;
                        justify-content: center;
                        margin-top: 1.5rem;
                        gap: 0.5rem;
                    }
                    .pagination-button {
                        padding: 0.5rem 1rem;
                        border-radius: 0.5rem;
                        font-weight: 500;
                        font-size: 0.875rem;
                        transition: all 0.2s ease;
                        background-color: var(--gray-200);
                        color: var(--gray-700);
                        border: none;
                        cursor: pointer;
                    }
                    .pagination-button:hover {
                        background-color: var(--gray-300);
                    }
                    .pagination-button.active {
                        background-color: var(--primary-600);
                        color: white;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    }

                    .admin-product-card {
                        background-color: var(--surface-color);
                        border-radius: 0.75rem;
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                        overflow: hidden;
                        border: 1px solid var(--border-light);
                        transition: transform 0.3s ease;
                    }
                    .admin-product-card:hover {
                        transform: scale(1.05);
                    }
                    .admin-product-image {
                        width: 100%;
                        height: 10rem; /* h-40 */
                        object-fit: cover;
                        object-position: center;
                    }
                    .admin-product-content {
                        padding: 1rem;
                    }
                    .admin-product-title {
                        font-size: 1.125rem;
                        font-weight: 700;
                        color: var(--text-primary);
                        margin-bottom: 0.25rem;
                    }
                    .admin-product-description {
                        color: var(--text-secondary);
                        font-size: 0.75rem;
                        margin-bottom: 0.5rem;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    .admin-product-price {
                        color: var(--primary-700);
                        font-weight: 800;
                        font-size: 1rem;
                        margin-bottom: 0.25rem;
                    }
                    .admin-product-meta {
                        color: var(--text-tertiary);
                        font-size: 0.75rem;
                    }
                    .admin-table-actions {
                        display: flex;
                        gap: 0.5rem;
                        flex-wrap: wrap; /* Allow buttons to wrap */
                        justify-content: flex-start;
                        align-items: center;
                    }
                    .admin-table-actions button {
                        font-size: 0.75rem; /* text-xs */
                        padding: 0.375rem 0.75rem; /* px-3 py-1.5 */
                        white-space: nowrap; /* Prevent text wrap inside buttons */
                    }
                    .status-badge.status-user {
                        background-color: var(--purple-200);
                        color: var(--purple-800);
                    }
                    .status-badge.status-admin {
                        background-color: var(--blue-200);
                        color: var(--blue-800);
                    }

                    /* --- ProductList Specifics --- */
                    .product-list-container {
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 1rem;
                        background-color: var(--background-main);
                        min-height: 100vh;
                    }
                    @media (min-width: 768px) {
                        .product-list-container {
                            padding: 2rem;
                        }
                    }
                    .product-list-title {
                        font-size: 2.25rem;
                        font-weight: 800;
                        color: var(--text-primary);
                        margin-bottom: 1.5rem;
                        text-align: center;
                    }
                    .product-list-subtitle {
                        font-size: 1.25rem;
                        color: var(--text-secondary);
                        margin-bottom: 2rem;
                        text-align: center;
                    }

                    .product-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 1.5rem;
                    }
                    @media (min-width: 768px) { /* md */
                        .product-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    @media (min-width: 1024px) { /* lg */
                        .product-grid {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }

                    .product-list-card {
                        background-color: var(--surface-color);
                        border-radius: 0.75rem;
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                        overflow: hidden;
                        border: 1px solid var(--border-light);
                        animation: fade-in 0.8s ease-out forwards;
                        transform: scale(1);
                        transition: all 0.3s ease;
                    }
                    .product-list-card:hover {
                        transform: scale(1.03);
                    }
                    .product-list-card-image {
                        width: 100%;
                        height: 14rem; /* h-56 */
                        object-fit: cover;
                        object-position: center;
                    }
                    .product-list-card-content {
                        padding: 1.25rem; /* p-5 */
                    }
                    .product-list-card-title {
                        font-size: 1.25rem;
                        font-weight: 700;
                        color: var(--text-primary);
                        margin-bottom: 0.5rem;
                    }
                    .product-list-card-description {
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        margin-bottom: 0.75rem;
                        display: -webkit-box;
                        -webkit-line-clamp: 3;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    .product-list-card-price {
                        color: var(--primary-700);
                        font-weight: 800;
                        font-size: 1.5rem; /* 2xl */
                        margin-bottom: 1rem;
                    }
                    .product-list-card-meta {
                        color: var(--text-tertiary);
                        font-size: 0.75rem;
                        margin-bottom: 1rem;
                    }
                    .product-list-add-to-cart-button {
                        width: 100%;
                        padding: 0.5rem 1rem; /* px-4 py-2 */
                        background-color: var(--accent-600);
                        color: white;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.3s ease;
                        transform: translateY(0);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.5rem;
                        cursor: pointer;
                        border: none;
                    }
                    .product-list-add-to-cart-button:hover {
                        background-color: var(--accent-700);
                        transform: translateY(-0.125rem);
                    }
                    .product-list-add-to-cart-button:active {
                        background-color: var(--accent-800);
                        transform: translateY(0);
                    }

                    /* --- CartPage Specifics --- */
                    .cart-page-container {
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 1rem;
                        background-color: var(--background-main);
                        min-height: 100vh;
                    }
                    @media (min-width: 768px) {
                        .cart-page-container {
                            padding: 2rem;
                        }
                    }
                    .cart-page-title {
                        font-size: 2.25rem;
                        font-weight: 800;
                        color: var(--text-primary);
                        margin-bottom: 1.5rem;
                        text-align: center;
                    }
                    .cart-content-wrapper {
                        background-color: var(--surface-color);
                        padding: 1.5rem;
                        border-radius: 1rem;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                        border: 1px solid var(--border-light);
                    }
                    .cart-items-list {
                        border-bottom: 1px solid var(--border-light);
                        padding-bottom: 1rem;
                    }
                    .cart-item {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        padding-top: 1rem;
                        padding-bottom: 1rem;
                    }
                    @media (min-width: 640px) { /* sm */
                        .cart-item {
                            flex-direction: row;
                            justify-content: space-between;
                            align-items: center;
                        }
                    }
                    .cart-item-image {
                        width: 6rem; /* w-24 */
                        height: 6rem; /* h-24 */
                        object-fit: cover;
                        border-radius: 0.5rem;
                        margin-right: 1rem;
                        margin-bottom: 1rem;
                        border: 1px solid var(--border-medium);
                        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                    }
                    @media (min-width: 640px) { /* sm */
                        .cart-item-image {
                            margin-bottom: 0;
                        }
                    }
                    .cart-item-details {
                        flex-grow: 1;
                        text-align: center;
                    }
                    @media (min-width: 640px) { /* sm */
                        .cart-item-details {
                            text-align: left;
                        }
                    }
                    .cart-item-title {
                        font-size: 1.125rem;
                        font-weight: 600;
                        color: var(--text-primary);
                    }
                    .cart-item-price {
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                    }
                    .cart-item-controls {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem;
                        margin-top: 1rem;
                    }
                    @media (min-width: 640px) { /* sm */
                        .cart-item-controls {
                            margin-top: 0;
                        }
                    }
                    .cart-item-quantity-input {
                        width: 4rem; /* w-16 */
                        padding: 0.25rem 0.5rem;
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem;
                        text-align: center;
                        transition: all 0.2s ease;
                    }
                    .cart-item-quantity-input:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500);
                    }
                    .cart-item-remove-button {
                        padding: 0.5rem 1rem;
                        background-color: var(--red-500);
                        color: white;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        font-size: 0.875rem;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.3s ease;
                        transform: translateY(0);
                        border: none;
                        cursor: pointer;
                    }
                    .cart-item-remove-button:hover {
                        background-color: var(--red-600);
                        transform: translateY(-0.125rem);
                    }

                    .cart-checkout-section {
                        margin-top: 1.5rem;
                        padding-top: 1rem;
                        border-top: 1px solid var(--border-light);
                    }
                    .cart-payment-details-form {
                        margin-bottom: 1rem;
                    }
                    .cart-guest-message {
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        margin-bottom: 0.5rem;
                    }
                    .cart-label {
                        display: block;
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                        font-weight: 600;
                        margin-bottom: 0.5rem;
                    }
                    .cart-input {
                        width: 100%;
                        padding: 0.75rem 1.25rem;
                        border: 1px solid var(--border-medium);
                        border-radius: 0.5rem;
                        transition: all 0.2s ease;
                    }
                    .cart-input:focus {
                        outline: none;
                        border-color: transparent;
                        box-shadow: 0 0 0 2px var(--accent-500);
                    }
                    .cart-summary-actions {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .cart-total {
                        font-size: 1.5rem;
                        font-weight: 700;
                        color: var(--text-primary);
                    }
                    .guest-order-token-display {
                        margin-top: 1rem;
                        padding: 0.75rem;
                        background-color: var(--blue-200);
                        border: 1px solid var(--blue-300);
                        color: var(--blue-800);
                        border-radius: 0.5rem;
                        font-size: 0.875rem;
                        text-align: center;
                    }

                    /* --- PresentationPage Specifics --- */
                    .presentation-page-container {
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        background: linear-gradient(to bottom right, var(--background-main), var(--background-dark));
                        padding: 1.5rem;
                    }

                    .hero-section {
                        position: relative;
                        width: 100%;
                        padding: 5rem 1rem; /* py-20 px-4 */
                        background-size: cover;
                        background-position: center;
                        border-radius: 1rem;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                        margin-bottom: 3rem;
                    }
                    @media (min-width: 768px) { /* md */
                        .hero-section {
                            padding: 5rem 2rem; /* px-8 */
                        }
                    }
                    .hero-overlay {
                        position: absolute;
                        inset: 0;
                        background-color: black;
                        opacity: 0.4;
                        border-radius: 1rem;
                    }
                    .hero-content {
                        position: relative;
                        z-index: 10;
                    }
                    .hero-title {
                        font-size: 3.75rem; /* 6xl */
                        font-weight: 800;
                        color: white;
                        margin-bottom: 1.5rem;
                        line-height: 1.25;
                        letter-spacing: -0.05em;
                        filter: drop-shadow(0 10px 8px rgba(0, 0, 0, 0.04)) drop-shadow(0 4px 3px rgba(0, 0, 0, 0.1));
                    }
                    .hero-subtitle {
                        font-size: 1.5rem; /* 2xl */
                        color: rgba(255, 255, 255, 0.9);
                        margin-bottom: 2.5rem;
                        max-width: 42rem;
                        margin-left: auto;
                        margin-right: auto;
                        line-height: 1.625;
                    }
                    .hero-actions {
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                        justify-content: center;
                    }
                    @media (min-width: 640px) { /* sm */
                        .hero-actions {
                            flex-direction: row;
                            gap: 1.5rem;
                        }
                    }
                    .hero-button-accent, .hero-button-primary {
                        padding: 1rem 2.5rem; /* px-10 py-4 */
                        font-size: 1.25rem; /* xl */
                        font-weight: 700;
                        border-radius: 9999px; /* rounded-full */
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                        transition: all 0.3s ease;
                        transform: translateY(0) scale(1);
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        cursor: pointer;
                        border: none;
                        text-decoration: none;
                    }
                    .hero-button-accent {
                        background-color: var(--accent-600);
                        color: white;
                    }
                    .hero-button-accent:hover {
                        background-color: var(--accent-700);
                        transform: translateY(-0.25rem) scale(1.05);
                    }
                    .hero-button-primary {
                        background-color: var(--primary-600);
                        color: white;
                    }
                    .hero-button-primary:hover {
                        background-color: var(--primary-700);
                        transform: translateY(-0.25rem) scale(1.05);
                    }

                    .section-container {
                        width: 100%;
                        max-width: 64rem;
                        margin-bottom: 3rem;
                    }
                    .section-title {
                        font-size: 2.25rem;
                        font-weight: 800;
                        color: var(--text-primary);
                        margin-bottom: 2rem;
                        text-align: center;
                    }
                    .grid-3-cols {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 2rem;
                    }
                    @media (min-width: 768px) { /* md */
                        .grid-3-cols {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }
                    .grid-2-cols {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 2rem;
                    }
                    @media (min-width: 768px) { /* md */
                        .grid-2-cols {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    .feature-card {
                        background-color: var(--surface-color);
                        padding: 1.5rem;
                        border-radius: 0.75rem;
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        transition: all 0.3s ease;
                        transform: scale(1);
                    }
                    .feature-card:hover {
                        transform: scale(1.05);
                    }
                    .feature-icon {
                        font-size: 3rem; /* 5xl */
                        margin-bottom: 1rem;
                    }
                    .feature-title {
                        font-size: 1.25rem;
                        font-weight: 600;
                        color: var(--text-primary);
                        margin-bottom: 0.5rem;
                    }
                    .feature-description {
                        color: var(--text-secondary);
                        font-size: 0.875rem;
                    }
                    .primary-color { color: var(--primary-600); }
                    .secondary-color { color: var(--secondary-600); }
                    .accent-color { color: var(--accent-600); }
                    .red-color { color: var(--red-600); }
                    .cyan-color { color: var(--cyan-600); }
                    .gray-700-color { color: var(--gray-700); }
                    .blue-800-color { color: var(--blue-800); }
                    .teal-color { color: var(--teal-600); }
                    .indigo-color { color: var(--indigo-600); }

                    .text-left-align {
                        text-align: left;
                        align-items: flex-start;
                    }
                    .feature-card-header {
                        display: flex;
                        align-items: center;
                        margin-bottom: 1rem;
                    }
                    .feature-title-small {
                        font-size: 1.5rem; /* 2xl */
                        font-weight: 600;
                        color: var(--text-primary);
                    }
                    .final-cta-text {
                        margin-top: 3rem;
                        font-size: 1rem;
                        color: var(--text-tertiary);
                    }
                    .final-cta-button {
                        margin-top: 1.5rem;
                        padding: 0.75rem 2rem; /* px-8 py-3 */
                        background-color: var(--secondary-600);
                        color: white;
                        font-size: 1.125rem; /* lg */
                        font-weight: 700;
                        border-radius: 9999px; /* rounded-full */
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                        transition: all 0.3s ease;
                        transform: translateY(0);
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        cursor: pointer;
                        border: none;
                        text-decoration: none;
                    }
                    .final-cta-button:hover {
                        background-color: var(--secondary-700);
                        transform: translateY(-0.125rem);
                    }


                    /* --- App Shell (MainAppContent) --- */
                    .app-container {
                        display: flex;
                        flex-direction: column;
                        min-height: 100vh;
                    }
                    .navbar {
                        background-color: var(--surface-color);
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                        padding: 1rem;
                        position: sticky;
                        top: 0;
                        z-index: 40;
                    }
                    .navbar-inner {
                        max-width: 1200px;
                        margin: 0 auto;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .navbar-brand {
                        font-size: 1.875rem; /* 3xl */
                        font-weight: 800;
                        color: var(--primary-600);
                        letter-spacing: 0.025em; /* tracking-wide */
                    }
                    .mobile-menu-button-container {
                        display: block;
                    }
                    @media (min-width: 768px) { /* md */
                        .mobile-menu-button-container {
                            display: none;
                        }
                    }
                    .mobile-menu-button {
                        color: var(--text-secondary);
                        background: none;
                        border: none;
                        cursor: pointer;
                        outline: none;
                    }
                    .mobile-menu-icon {
                        width: 2rem;
                        height: 2rem;
                    }
                    .navbar-menu {
                        display: none;
                        position: absolute;
                        top: 100%; /* Below the navbar */
                        left: 0;
                        width: 100%;
                        background-color: var(--surface-color);
                        padding: 1rem;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.3s ease-in-out;
                        transform: translateY(-100%);
                        opacity: 0;
                        pointer-events: none;
                    }
                    .navbar-menu.is-open {
                        display: flex;
                        flex-direction: column;
                        transform: translateY(0);
                        opacity: 1;
                        pointer-events: all;
                    }
                    @media (min-width: 768px) { /* md */
                        .navbar-menu {
                            display: flex;
                            position: static;
                            top: auto;
                            left: auto;
                            width: auto;
                            background-color: transparent;
                            padding: 0;
                            box-shadow: none;
                            flex-direction: row;
                            gap: 1rem; /* space-x-4 */
                            transform: translateY(0);
                            opacity: 1;
                            pointer-events: all;
                        }
                    }

                    .nav-link {
                        color: var(--text-secondary);
                        font-weight: 600;
                        transition: all 0.3s ease;
                        padding: 0.5rem 0.75rem; /* px-3 py-2 */
                        border-radius: 0.5rem;
                        display: flex;
                        align-items: center;
                        gap: 0.25rem;
                        width: 100%;
                        text-align: left;
                        background: none;
                        border: none;
                        cursor: pointer;
                        text-decoration: none;
                        font-size: 1.125rem; /* Increased font size for menu items */
                    }
                    .nav-link:hover {
                        color: var(--primary-600);
                        background-color: var(--primary-50); /* Subtle hover background */
                    }
                    @media (min-width: 768px) { /* md */
                        .nav-link {
                            width: auto;
                            text-align: center;
                        }
                    }

                    .cart-link {
                        position: relative;
                    }
                    .cart-badge {
                        position: absolute;
                        top: -0.25rem;
                        right: -0.25rem;
                        background-color: var(--red-500);
                        color: white;
                        font-size: 0.75rem;
                        font-weight: 700;
                        border-radius: 9999px;
                        height: 1.25rem;
                        width: 1.25rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: 2px solid var(--surface-color);
                        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                    }
                    .nav-button-login {
                        padding: 0.5rem 1.25rem; /* px-5 py-2 */
                        background-color: var(--primary-600);
                        color: white;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        width: 100%;
                        text-align: left;
                        border: none;
                        cursor: pointer;
                        text-decoration: none;
                        font-size: 1.125rem; /* Increased font size for menu items */
                    }
                    .nav-button-login:hover {
                        background-color: var(--primary-700);
                    }
                    @media (min-width: 768px) { /* md */
                        .nav-button-login {
                            width: auto;
                            text-align: center;
                            margin-left: 1rem;
                        }
                    }

                    .nav-button-logout {
                        padding: 0.5rem 1.25rem;
                        background-color: var(--red-500);
                        color: white;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        width: 100%;
                        text-align: left;
                        border: none;
                        cursor: pointer;
                        text-decoration: none;
                        font-size: 1.125rem; /* Increased font size for menu items */
                    }
                    .nav-button-logout:hover {
                        background-color: var(--red-600);
                    }
                    @media (min-width: 768px) { /* md */
                        .nav-button-logout {
                            width: auto;
                            text-align: center;
                            margin-left: 1rem;
                        }
                    }

                    .app-main-content {
                        flex-grow: 1;
                    }

                    .app-loading-container {
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: linear-gradient(to bottom right, var(--background-light), var(--background-dark));
                    }
                    .app-loading-text {
                        font-size: 1.5rem;
                        font-weight: 600;
                        color: var(--text-secondary);
                        animation: pulse 1.5s infinite ease-in-out;
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }

                    .access-denied-container {
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: linear-gradient(to bottom right, #fef2f2, #ffedd5); /* from-red-100 to-orange-200 */
                    }
                    .access-denied-card {
                        background-color: var(--surface-color);
                        padding: 2rem;
                        border-radius: 1rem;
                        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                        text-align: center;
                        border-top: 0.25rem solid var(--red-500);
                    }
                    .access-denied-title {
                        font-size: 1.5rem;
                        font-weight: 700;
                        color: #B91C1C; /* red-700 */
                        margin-bottom: 1rem;
                    }
                    .access-denied-message {
                        font-size: 1.125rem;
                        color: var(--text-secondary);
                        margin-bottom: 1.5rem;
                    }
                    .access-denied-button {
                        padding: 0.75rem 1.5rem;
                        background-color: var(--primary-600);
                        color: white;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.3s ease;
                        border: none;
                        cursor: pointer;
                        text-decoration: none;
                    }
                    .access-denied-button:hover {
                        background-color: var(--primary-700);
                    }


                    /* --- Footer Specifics --- */
                    .app-footer {
                        background-color: var(--gray-900);
                        color: white;
                        padding: 2rem;
                        margin-top: auto;
                        box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06); /* shadow-inner */
                        border-top: 0.25rem solid var(--primary-700);
                    }
                    .footer-container {
                        max-width: 1200px;
                        margin: 0 auto;
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 2rem;
                    }
                    @media (min-width: 768px) { /* md */
                        .footer-container {
                            grid-template-columns: repeat(4, 1fr);
                        }
                    }
                    .footer-heading {
                        font-size: 1.25rem;
                        font-weight: 700;
                        color: var(--primary-300);
                        margin-bottom: 1rem;
                    }
                    .footer-text {
                        color: var(--gray-400);
                        font-size: 0.875rem;
                        line-height: 1.5rem;
                    }
                    .footer-contact-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                        display: flex;
                        flex-direction: column;
                        gap: 0.5rem;
                        color: var(--gray-400);
                        font-size: 0.875rem;
                    }
                    .footer-contact-item {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                    }
                    .footer-social-links {
                        display: flex;
                        gap: 1rem;
                    }
                    .social-link {
                        color: var(--gray-400);
                        transition: color 0.3s ease;
                        text-decoration: none;
                    }
                    .social-link.facebook:hover { color: var(--blue-500); }
                    .social-link.twitter:hover { color: var(--blue-400); }
                    .social-link.instagram:hover { color: var(--red-500); } /* Using red-500 for a more vibrant Instagram feel */
                    .social-link.linkedin:hover { color: var(--blue-700); }

                    .footer-feedback-form {
                        display: flex;
                        flex-direction: column;
                        gap: 0.75rem;
                    }
                    .feedback-textarea {
                        width: 100%;
                        padding: 0.75rem;
                        border-radius: 0.5rem;
                        background-color: var(--gray-800);
                        border: 1px solid var(--gray-700);
                        color: white;
                        resize: vertical; /* Allow vertical resizing */
                    }
                    .feedback-textarea::placeholder {
                        color: var(--gray-500);
                    }
                    .feedback-textarea:focus {
                        outline: none;
                        box-shadow: 0 0 0 2px var(--primary-500);
                        border-color: var(--primary-500);
                    }
                    .feedback-submit-button {
                        width: 100%;
                        background-color: var(--primary-600);
                        color: white;
                        padding: 0.5rem 0;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        transition: background-color 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.5rem;
                        border: none;
                        cursor: pointer;
                    }
                    .feedback-submit-button:hover {
                        background-color: var(--primary-700);
                    }
                    .feedback-message {
                        font-size: 0.75rem;
                        color: #4CAF50; /* A shade of green for success */
                        margin-top: 0.5rem;
                        text-align: center;
                    }
                    .footer-bottom-text {
                        text-align: center;
                        color: var(--gray-500);
                        font-size: 0.75rem;
                        margin-top: 2rem;
                        padding-top: 1.5rem;
                        border-top: 1px solid var(--gray-700);
                    }
                    @keyframes fade-in-down {
                        from { opacity: 0; transform: translateY(-20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    .animate-fade-in-down {
                        animation: fade-in-down 0.5s ease-out forwards;
                    }
                    @keyframes fade-in {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    .animate-fade-in {
                        animation: fade-in 0.6s ease-out forwards;
                    }
                    `}
                </style>
                <MainAppContent />
            </CartProvider>
        </AuthProvider>
    );
}
