import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import productsRouter from './routes/products'; // Import product routes

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 5000;

// Security Middleware
app.use(helmet());

// CORS Configuration (Configure as needed)
const allowedOrigins = ['https://acme-services.vercel.app'];  // Allow your frontend
const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
};
app.use(cors(corsOptions));

// Middleware to parse JSON request bodies
app.use(express.json());

// Routes
app.use('/api/products', productsRouter); // Mount product routes

// Error handling middleware (example)
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});