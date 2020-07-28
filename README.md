# Image Handling Lambda

**Purpose**

Function is triggered by an S3 bucket event and converts image files (including heic) to jpeg. Also produces multiple copies at different qualities denoted by a suffix to represent either the image percentage quality or pixel width.

Also contains AWS Recognition to retrieve labels for the images that can be used to remove unsafe content.