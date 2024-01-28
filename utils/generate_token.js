import Jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const generate_token = (Data,duration)=>{
    const token = Jwt.sign(Data,process.env.secretkey,{expiresIn: duration});
    return token;
};

export default generate_token;