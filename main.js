const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
const port = 3000;


app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
    
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('frontend'));
app.use(cookieParser());
// Kết nối tới MongoDB
function connect() {
    mongoose.connect('mongodb://127.0.0.1:27017/nha_hang')
        .then(() => {
            console.log('Connected to MongoDB');
        })
        .catch((error) => {
            console.log('Error connecting to MongoDB:', error.message);
        });
}

// Định nghĩa FoodSchema
const Schema = mongoose.Schema;

const BookingSchema = new Schema({
    name: String,          
    phone: String,         
    email: String,         
    booking_date: Date,    
    booking_time: String,  
    guests: Number,        
    notes: String,         
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'canceled'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});
const db={
    users:[
        {id:1, username:'nguyenhoangduy', password:'123456'},
        {id:2, username:'nguyenvana', password:'123456789'}
    ]
}



// Tạo model từ FoodSchema
const Booking = mongoose.model('Booking', BookingSchema, 'booking');

// Gọi hàm connect để kết nối tới MongoDB
connect();


app.post('/store', async (req, res) => {
    try {
        const { booking_date } = req.body; // Lấy ngày đặt bàn từ dữ liệu gửi lên
        const selectedDate = new Date(booking_date);
        selectedDate.setHours(0, 0, 0, 0); // Đặt giờ về 00:00:00 để so sánh chính xác
        
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1); // Ngày kế tiếp để làm giới hạn khoảng thời gian

        // Kiểm tra số lượng đặt bàn đã được xác nhận trong ngày được chọn
        const confirmedOrders = await Booking.countDocuments({
            booking_date: {
                $gte: selectedDate,
                $lt: nextDay
            },
            status: 'confirmed'
        });

        // Xác định trạng thái đặt bàn
        const bookingData = {
            ...req.body,
            status: confirmedOrders >= 2 ? 'pending' : 'confirmed',
            createdAt: new Date() // Lưu thời gian tạo đặt bàn
        };

        // Lưu dữ liệu đặt bàn
        const booking = new Booking(bookingData);
        await booking.save();

        res.json({
            success: true,
            message: booking.status === 'confirmed' ? 'Đặt bàn thành công!' : 'Đơn của bạn đang chờ xác nhận!',
            redirectUrl: 'index3.html'
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error'
        });
    }
});


// server.js
app.delete('/:id/force', (req, res, next) => {
    const bookingId = req.params.id;
    //console.log(bookingId)
    Booking.findById(bookingId)
      .then(booking => {
        if (!booking) {
          return res.status(404).json({ message: 'Không tìm thấy đơn' });
        }
  
        return Booking.deleteOne({ _id: bookingId })
          .then(() => {       
            res.status(200).json({ message: 'Xóa đơn thành công' });
          })
          .catch(next);
      })
      .catch(next);
  });


app.get('/menu', (req, res) => {
    const { date, status } = req.query; // Lấy ngày và trạng thái từ query parameters

    // Xây dựng bộ lọc
    const filter = {};
    if (date) {
        const startOfDay = new Date(date);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        filter.booking_date = { $gte: startOfDay, $lte: endOfDay }; // Lọc theo ngày
    }
    if (status) {
        filter.status = status; // Lọc theo trạng thái nếu có
    }

    // Truy vấn MongoDB với bộ lọc
    Booking.find(filter).lean()
        .then((booking) => {
            res.json(booking);
        })
        .catch((error) => {
            console.error('Error:', error.message);
            res.status(500).send({ error: 'Internal Server Error' });
        });
});


app.put('/:id', (req, res) => {
    Booking.updateOne(
        { _id: req.params.id, status: 'pending' },
        { $set: { status: 'confirmed' } }
    ).then((result) => {
        res.status(200).json({ message: 'Cập nhật đơn thành công' });
    }).catch((error) => {
        console.error('Error updating:', error);
    });
})

const sessions={}

const checkAuth = (req, res, next) => {
    const sessionId = req.cookies.sessionId;

    console.log('Checking sessionId:', sessionId);
    console.log('Current sessions:', sessions);

    if (!sessionId || !sessions[sessionId]) {
        console.log('Authentication failed. Session not found.');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    req.userId = sessions[sessionId].userId;
    console.log('Authentication successful. UserId:', req.userId);
    next();
};


//Route đăng nhập
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(user => 
        user.username === username && user.password === password
    );

    if (!user) {
        return res.status(401).json({ 
            success: false,
            message: 'Invalid credentials' 
        });
    }

    const sessionId = Date.now().toString();
    sessions[sessionId] = { userId: user.id };
    
    res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Max-Age=3600000; Path=/; SameSite=None; secure`);

    res.json({
        success: true,
        message: 'Login successful',
        redirectUrl: 'admin.html'  // Thêm redirectUrl vào response
    });
    //console.log(sessions.userId)
});

// Route kiểm tra auth
app.get('/check-auth', checkAuth, (req, res) => {
    
    res.json({ success: true,
        message: 'Authenticated' });
});

app.get('/users', (req, res) => {
    try {
        const sessionId = req.cookies.sessionId;
        
        // Log để debug
        //console.log('Cookies received:', req.cookies);
        //console.log('Session ID:', sessionId);
        //console.log('Available sessions:', sessions);
        
        if (!sessionId || !sessions[sessionId]) {
            return res.status(401).json({
                success: false,
                message: 'Vui lòng đăng nhập'
            });
        }

        const userId = sessions[sessionId].userId;
        const user = db.users.find(user => user.id === userId);

        res.json({
            success: true,
            user: user || {}
        });
    } catch (error) {
        console.error('Error in /users:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

// Route đăng xuất
app.post('/logout', (req, res) => {
    const sessionId = req.cookies?.sessionId;
    if (sessionId) {
        delete sessions[sessionId];
        res.clearCookie('sessionId');
    }
    res.json({ message: 'Logged out' });
});

// Lắng nghe trên cổng đã định
app.listen(port, function () {
    console.log('Server is running on port ' + port);
});

