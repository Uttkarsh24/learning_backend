import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const generateAccessAndRefreshToken = async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        
        return { accessToken,refreshToken }
    } catch (error) {
        throw new ApiError( 500,"Something went wrong while generating refresh and access token.")
    }

}

const registerUser = asyncHandler( async (req,res) => {

    const {fullName , email, username ,password} = req.body;
    //console.log("email:", email);

    //checking if all fields have values in them
    if (
        [fullName,email,username,password].some((field)=>
            field?.trim()===""
        )
    ) {
        throw new ApiError(400,"all fields are required")
    }

    //checking if user already exists
    const existedUser = await User.findOne({
        $or: [{ username },{ email }]
    })

    if(existedUser){
        throw new ApiError(409,"User already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }
    
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    }
    //uploading on cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverimage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(400,"Avatar file is required")
    }

    //all checks done 

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverimage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })
    
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500,"Internal Sever error")
    }

    return res.status(201).json(
        new ApiResponse(200,createdUser,"User creation success")
    )
} )

const  loginUser = asyncHandler( async (req,res)=>{ 
    const {username,password,email} = req.body;

    if(!username && !email){
        throw new ApiError(400,"Username or password required");
    }

    const user = await User.findOne({
        $or:[username,email]
    })

    if(!user){
        throw new ApiError(404,"User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new ApiError(401,"Password Incorrect");
    }

    const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly : true,
        secure:true
    }

    return res.
    status(200).
    cookie("accessToken",accessToken,options).cookie("refreshToken",refreshToken,options).
    json(
        new ApiResponse(200,
        {
            user: loggedInUser , accessToken, refreshToken    
        },
        "User Logged In Successfully"
    )
    )
})

const logoutUser = asyncHandler(async (req,res)=>{

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken: undefined
            }
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly : true,
        secure:true
    }

    return res.status(200).clearCookie("accessToken",options).
    clearCookie("refreshToken",options).
    json(200,{},"User Logged Out")
})

export {registerUser , loginUser , logoutUser}