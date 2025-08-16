require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Enable CORS for Live Server
app.use(cors({
    origin: 'http://127.0.0.1:5500',
    methods: ['GET','POST','DELETE','PUT'],
    credentials: true
}));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'supersecret123',
    resave: false,
    saveUninitialized: false
}));

// MongoDB
mongoose.connect(process.env.DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(()=>console.log('✅ MongoDB connected'))
.catch(err=>console.error('❌ MongoDB connection error:', err));

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Schemas
const userSchema = new mongoose.Schema({
    fullName: String,
    email: String,
    role: { type:String, enum:['admin','buyer'] },
    userID: { type:String, unique:true },
    pin: String,
    cart: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    createdAt: { type:Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const productSchema = new mongoose.Schema({
    name: String,
    description: String,
    price: Number,
    quantity: Number,
    createdAt: { type:Date, default: Date.now }
});
const Product = mongoose.model('Product', productSchema);

// Test
app.get('/', (req,res)=>res.send('E-Commerce backend running'));

// Registration
app.post('/register', async (req,res)=>{
    try{
        const { fullName,email,role } = req.body;
        if(!fullName || !email || !role) return res.status(400).send('❌ All fields required');

        const userID = 'ID'+crypto.randomBytes(3).toString('hex').toUpperCase();
        const pin = Math.floor(1000 + Math.random()*9000).toString();

        const newUser = new User({ fullName,email,role,userID,pin });
        await newUser.save();

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your E-Commerce Account Credentials',
            text: `Hello ${fullName},\nUser ID: ${userID}\nPIN: ${pin}`
        });

        res.json({ message:'✅ Registered successfully', userID, pin });
    } catch(err){ console.error(err); res.status(500).send('❌ Registration failed'); }
});

// Login
app.post('/login', async (req,res)=>{
    try{
        const { userID,pin } = req.body;
        const user = await User.findOne({ userID, pin });
        if(!user) return res.status(400).json({ message:'❌ Invalid ID or PIN' });

        req.session.user = { id:user._id, role:user.role };
        res.json({ message:'✅ Login successful', role:user.role, userID:user.userID });
    } catch(err){ console.error(err); res.status(500).json({ message:'❌ Login failed' }); }
});

// Admin add product
app.post('/product/add', async (req,res)=>{
    try{
        const { name, description, price, quantity } = req.body;
        if(!name || !price || !quantity) return res.status(400).send('❌ Missing fields');

        const product = new Product({ name, description, price, quantity });
        const saved = await product.save();
        res.json(saved); // Return the saved product object
    } catch(err){ console.error(err); res.status(500).send('❌ Adding product failed'); }
});

// Admin remove product
app.delete('/product/remove/:id', async (req,res)=>{
    try{
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message:'✅ Product removed successfully' });
    } catch(err){ console.error(err); res.status(500).send('❌ Removing product failed'); }
});

// Get all products
app.get('/products', async (req,res)=>{
    try{
        const products = await Product.find();
        res.json(products);
    } catch(err){ console.error(err); res.status(500).send('❌ Cannot fetch products'); }
});

// Buyer add to cart
app.post('/cart/add', async (req,res)=>{
    try{
        const { userID, productID } = req.body;
        const user = await User.findOne({ userID });
        if(!user) return res.status(400).send('❌ User not found');

        if(!user.cart.includes(productID)) user.cart.push(productID);
        await user.save();
        res.json({ message:'✅ Product added to cart' });
    } catch(err){ console.error(err); res.status(500).send('❌ Adding to cart failed'); }
});

// Buyer remove from cart
app.post('/cart/remove', async (req,res)=>{
    try{
        const { userID, productID } = req.body;
        const user = await User.findOne({ userID });
        if(!user) return res.status(400).send('❌ User not found');

        user.cart = user.cart.filter(id=>id.toString()!==productID);
        await user.save();
        res.json({ message:'✅ Product removed from cart' });
    } catch(err){ console.error(err); res.status(500).send('❌ Removing from cart failed'); }
});

// Get cart items
app.get('/cart/:userID', async (req,res)=>{
    try{
        const user = await User.findOne({ userID:req.params.userID }).populate('cart');
        if(!user) return res.status(400).send('❌ User not found');
        res.json(user.cart);
    } catch(err){ console.error(err); res.status(500).send('❌ Cannot fetch cart'); }
});

app.listen(PORT, ()=>console.log(`🚀 Server running at http://localhost:${PORT}`));
