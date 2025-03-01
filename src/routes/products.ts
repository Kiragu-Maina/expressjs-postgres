import express, { Request, Response } from 'express';
import { query, validationResult, body, param } from 'express-validator';
import pg from "pg";

// Connect to the database using the DATABASE_URL environment
//   variable injected by Railway
const pool = new pg.Pool();

const router = express.Router();

// Helper function to handle errors from express-validator
const handleValidationErrors = (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
};

// GET /api/products - Get products with filtering, sorting, and pagination
router.get(
    '/',
    [
        // Validation chain for query parameters
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'), // Add max
        query('minPrice').optional().isFloat().withMessage('minPrice must be a number'),
        query('maxPrice').optional().isFloat().withMessage('maxPrice must be a number'),
    ],
    async (req: Request, res: Response): Promise<any> => {
        handleValidationErrors(req, res);  // Check for validation errors

        const { search, sort, category, minPrice, maxPrice, page, limit } = req.query;

        const pageNumber = Number(page) || 1;
        const pageSize = Number(limit) || 20;
        const offset = (pageNumber - 1) * pageSize;

        let queryStr = 'SELECT * FROM products WHERE 1=1'; // Start with a base query

        const queryParams: any[] = []; // Use 'any[]' for the arguments array

        // 1. Filtering
        if (search) {
            const searchTerm = '%' + (search as string).toLowerCase() + '%';  // Add wildcards for LIKE
            queryStr += ' AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)';
            queryParams.push(searchTerm, searchTerm);
        }

        if (category) {
            queryStr += ' AND category = ?';
            queryParams.push(category);
        }

        if (minPrice) {
            queryStr += ' AND price >= ?';
            queryParams.push(Number(minPrice));
        }

        if (maxPrice) {
            queryStr += ' AND price <= ?';
            queryParams.push(Number(maxPrice));
        }

        // 2. Sorting
        let sortColumn = 'id'; // Default sort column
        let sortOrder = 'ASC';   // Default sort order

        if (sort) {
            switch (sort) {
                case 'new':
                    sortColumn = 'id';
                    sortOrder = 'DESC';
                    break;
                case 'priceAsc':
                    sortColumn = 'price';
                    sortOrder = 'ASC';
                    break;
                case 'priceDesc':
                    sortColumn = 'price';
                    sortOrder = 'DESC';
                    break;
                default:
                    sortColumn = 'id';
                    sortOrder = 'ASC';
                    break;
            }
        }

        queryStr += ` ORDER BY ${sortColumn} ${sortOrder}`;

        // 3. Pagination
        queryStr += ' LIMIT ? OFFSET ?';
        queryParams.push(pageSize, offset);

        try {
            const [rows]: any = await pool.query(queryStr, queryParams);

            const productsWithImages = await Promise.all(
                rows.map(async (product: any) => {
                    const [imageRows]: any = await pool.query(
                        'SELECT image_url FROM product_images WHERE product_id = ?',
                        [product.id]
                    );
                    return {
                        ...product,
                        imageUrls: imageRows.map((row: any) => row.image_url),
                    };
                })
            );

            const [countResult]: any = await pool.query('SELECT COUNT(*) AS total FROM products');  // Get total count
            const total = countResult[0].total;

            res.json({
                products: productsWithImages,
                total: total
            });
        } catch (error) {
            console.error('Error fetching products:', error);
            return res.status(500).json({ message: 'Failed to fetch products' });
        }
    }
);

// GET /api/products/:id - Get a single product by ID
router.get(
    '/:id',
    [
        // Validate that the id parameter is an integer
        param('id').isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
    ],
    async (req: Request, res: Response): Promise<any> => {
        handleValidationErrors(req, res);

        const { id } = req.params;

        try {
            // Fetch the product from the database
            const [productRows]: any = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
            const product = productRows[0];

            // If the product doesn't exist, return a 404
            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            // Fetch the image URLs for the product
            const [imageRows]: any = await pool.query('SELECT image_url FROM product_images WHERE product_id = ?', [id]);
            const imageUrls = imageRows.map((row: any) => row.image_url);

            // Combine product data with image URLs
            const productWithImages = {
                ...product,
                imageUrls: imageUrls,
            };

            // Return the product with images
            res.json(productWithImages);

        } catch (error) {
            console.error('Error fetching product:', error);
            return res.status(500).json({ message: 'Failed to fetch product' });
        }
    }
);

// POST /api/products - Create a new product
router.post('/',
    [
        // Add validation for the imageUrls array
        body('imageUrls').isArray().withMessage('imageUrls must be an array'),
        body('imageUrls.*').isURL().withMessage('Each imageUrl must be a valid URL'),
        body('name').notEmpty().withMessage('Name is required'),
        body('description').notEmpty().withMessage('Description is required'),
        body('price').isFloat().withMessage('Price must be a number'),
        body('category').notEmpty().withMessage('Category is required'),
    ],
    async (req: Request, res: Response): Promise<any> => {
        handleValidationErrors(req, res);

        try {
            const { name, description, price, category, imageUrls } = req.body;

            // Insert the new product
            const query = 'INSERT INTO products (name, description, price, category) VALUES (?, ?, ?, ?)';  // No imageUrl
            const [result]: any = await pool.query(query, [name, description, price, category]);

            const newProductId = result.insertId;

            // Insert the image URLs into the product_images table
            for (const imageUrl of imageUrls) {
                await pool.query('INSERT INTO product_images (product_id, image_url) VALUES (?, ?)', [
                    newProductId,
                    imageUrl,
                ]);
            }

            // Fetch the newly created product with its images
            const [newProductRows]: any = await pool.query('SELECT * FROM products WHERE id = ?', [newProductId]);
            const newProduct = newProductRows[0];

            const [newProductImages]: any = await pool.query('SELECT image_url FROM product_images WHERE product_id = ?', [newProductId]);

            const productWithImages = {
                ...newProduct,
                imageUrls: newProductImages.map((row: any) => row.image_url),
            };

            res.status(201).json({ message: 'Product created successfully', product: productWithImages });
        } catch (error) {
            console.error('Error creating product:', error);
            res.status(500).json({ message: 'Failed to create product' });
        }
    });

export default router;