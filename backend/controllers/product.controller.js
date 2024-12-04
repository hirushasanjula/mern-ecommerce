import cloudinary from "../lib/cloudinary.js";
import { redis } from "../lib/redis.js";
import Product from "../models/product.model.js";


export const getAllproducts = async (req, res) => {
    try {
        const products = await Product.find({});
        res.json({products});
    } catch (error) {
        console.log("Error in getAllproducts: ", error.message);
        res.status(500).json({message: "Server Error", error: error.message});
    }
}

export const getFeaturedProducts = async (req, res) => {
    try {
       let featuredProducts = await redis.get("featured_products")
       if(featuredProducts) {
        return res.json(JSON.parse(featuredProducts))
       }
       // if not found in redis, get from db
       // lean() is used to return plain javascript object instead of mongoose document
       // which is faster
       featuredProducts = await Product.find({isFeatured: true}).lean();

       if(!featuredProducts) {
           return res.status(404).json({message: "Featured products not found"});
       }

       // store in redis for future quicke access

       await redis.set("featured_products", JSON.stringify(featuredProducts));

       res.json(featuredProducts);
    } catch (error) {
        console.log("Error in getFeaturedProducts: ", error.message);
        res.status(500).json({message: "Server Error", error: error.message});
    } 
}


export const createProduct = async (req, res) => {
    try {
        const {name, description, price, image, category} = req.body;

        let cloudinaryResponse = null

        if(image){
            cloudinaryResponse = await cloudinary.uploader.upload(image, {folder: "products"})
        }

        const product = await Product.create({
            name,
            description,
            price,
            image: cloudinaryResponse?.secure_url? cloudinaryResponse.secure_url : "",
            category
        })
        
        res.status(201).json({product});
    } catch (error) {
        console.log("Error in createProduct: ", error.message);
        res.status(500).json({message: "Server Error", error: error.message});
    }
}

export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if(!product) {
            return res.status(404).json({message: "Product not found"});
        }

        if(product.image){
            const publicId = product.image.split("/").pop().split(".")[0];
            try {
                await cloudinary.uploader.destroy(`products/${publicId}`);
                console.log("Image deleted from cloudinary");
            } catch (error) {
                console.log("Error in deleting image from cloduinary: ", error.message);
                res.status(500).json({message: "Server Error", error: error.message});
            }
        }
        await Product.findByIdAndDelete(req.params.id);

        res.json({message: "Product deleted successfully"});
    } catch (error) {
        console.log("Error in deleteProduct controller ", error.message);
        res.status(500).json({message: "Server Error", error: error.message});
    }
}


export const getRecommendedProducts = async (req, res) => {
    try {
        const products = await Product.aggregate([
            {
                $sample: {size: 4}
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    description: 1,
                    price: 1,
                    image: 1
                }
            }
        ]);

        res.json(products);
    } catch (error) {
        console.log("Error in getRecommendedProducts: ", error.message);
        res.status(500).json({message: "Server Error", error: error.message});
    }
}

export const getProductByCategory = async (req, res) => {
    const {category} = req.params;
    try {
        const products = await Product.find({category});
        res.json({products});
    } catch (error) {
        console.log("Error in getProductByCategory: ", error.message);
        res.status(500).json({message: "Server Error", error: error.message});
    }
}


export const toggleFeaturedProduct = async (req, res) => {

    try {
        const product = await Product.findById(req.params.id);
        if(product) {
            product.isFeatured = !product.isFeatured;
            const updatedProduct = await product.save();
            //update redis
            await updateFeaturedProductsCache();
            res.json(updatedProduct)
        } else {
            res.status(404).json({message: "Product not found"})
        }
    } catch (error) {
        console.log("Error in toggleFeaturedProduct controller", error.message);
        res.status(500).json({message: "Server error", error: error.message})
    }
}

async function updateFeaturedProductsCache() {
    try {
        const featuredProducts = await Product.find({isFeatured: true}).lean()
        await redis.set("featured_products", JSON.stringify(featuredProducts), "EX")
    } catch (error) {
        console.log("error in update cache function")
    }
}