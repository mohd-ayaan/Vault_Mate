import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(`mongodb+srv://kshitijkumardubey99:${process.env.DATABASEPASSWORD}@cluster0.bqmvxj7.mongodb.net/vaultmate`);
mongoose.connection.on('connected',() => {
    console.log('Connected to the database');
});

export default mongoose;