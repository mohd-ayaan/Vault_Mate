import Images from "../models/image_model.js";
import Users from  "../models/user_model.js";

const save_image_file_service = (file, userID ,feilds) => {

    return new Promise((resolve, reject) => {
        if (!file) {
            return reject({ message: "No file provided" });
        }
        const fileType = feilds;
        // Multer captures the image and stores it in memory.convert it to base64 (binary data) for storage in mongoDB
        const imageBuffer = file.buffer.toString("base64");
        console.log(userID);

        // const image = new Images({ ImageName: fileType, Image: imageBuffer });
        // Detect MIME type from base64 prefix
        const mimeType = file.mimetype;
        
        // Save image with MIME type
        const image = new Images({
          ImageName: fileType,
          Image: imageBuffer,
          MimeType: mimeType
        });

    
        image
            .save()
            .then((response) => {
                // resolve({ message: "Profile image saved successfully" });
                Users.updateOne({ _id: userID }, { [response.ImageName] : response._id })
                    .then(() => {
                        resolve({ message: "image updated successfully" });
                    })
                    .catch((err) => {
                        reject({ message: "Error uploading/updating image" });
                    });
            })
            .catch((err) => {
                console.log(err);
            });
    });
};

export default save_image_file_service;