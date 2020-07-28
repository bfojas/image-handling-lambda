exports.handler = (event, context, callback) => {
  var AWS = require("aws-sdk");
  var rekognition = new AWS.Rekognition();
  var sharp = require("sharp");
  var FileType = require("file-type");
  var convert = require("heic-convert");
  var s3 = new AWS.S3();
  var sourceBucket = event.Records[0].s3.bucket.name;

  var objectKey = event.Records[0].s3.object.key;
  var getObjectParams = {
    Bucket: sourceBucket,
    Key: objectKey,
  };

  var rekognitionParams = {
    Image: {
      S3Object: {
        Bucket: sourceBucket,
        Name: objectKey,
      },
    },
    MaxLabels: 50,
    MinConfidence: 70,
  };

  var qualityArray = [50, 25];
  var widthArray = [3200, 2600, 2000, 1600, 1080, 800, 120];

  var uploadParams = {
    Bucket: sourceBucket,
    ContentType: "image/jpeg",
    StorageClass: "STANDARD",
  };

  if (
    ![...qualityArray, ...widthArray].some((el) => objectKey.endsWith(`_${el}`))
  ) {
    s3.getObject(getObjectParams, async function (err, data) {
      if (err) {
        console.log(`${objectKey} retrieval failed.`);
        console.log(err, err.stack);
      } else {
        console.log(`${objectKey} retrieval successful.`);
        const type = await FileType.fromBuffer(data.Body);
        const acceptedExt = ["gif", "png", "jpg", "jpeg", "bmp", "heic"];

        const retrieveRekognitionLabels = (params) => {
          rekognition.detectLabels(params, (err, data) => {
            if (err) {
              console.log(`${objectKey} rekognition failed.`);
              console.log(err, err.stack);
            } else {
              // TODO:
              // - Handle image labels
              // - Remove unsafe content
              console.log(data.Labels);
            }
          });

        }


        const heicToJpg = async (file) => {
          console.log(`Converting ${objectKey}`);
          const outputBuffer = await convert({
            buffer: file, // the HEIC file buffer
            format: "JPEG", // output format
          }).catch((err) => {
            console.log("err", err);
          });
          return s3.upload(
            { ...uploadParams, Key: objectKey, Body: outputBuffer },
            function (err, data) {
              if (err) {
                console.log(err, err.stack);
              } else {
                console.log("S3 converted object upload successful.");
              }
            }
          );
        };

        const resizeQuality = async (size) => {
          console.log(`Resizing ${objectKey} to ${size} quality`);
          const image = await sharp(data.Body);
          return image
            .metadata()
            .then((metadata) => {
              return image
                .withMetadata()
                .resize(Math.round(metadata.width * (size / 100)))
                .jpeg()
                .toBuffer();
            })
            .then((res) => {
              var uploadObjectKey = objectKey + "_" + size;
              console.log(`uploading ${uploadObjectKey}`);
              return s3.upload(
                { ...uploadParams, Key: uploadObjectKey, Body: res },
                function (err, data) {
                  if (err) {
                    console.log(err, err.stack);
                  } else {
                    console.log("S3 compressed object upload successful.");
                  }
                }
              );
            })
            .catch((err) => {
              console.log(err, err.stack);
            });
        };

        const resizeWidth = async (size) => {
          const image = await sharp(data.Body);
          return image
            .metadata()
            .then((metadata) => {
              if (Number(metadata.width) > Number(size)) {
                console.log(`Resizing ${objectKey} to ${size} width`);
                return image.withMetadata().resize(size).jpeg().toBuffer();
              } else {
                return null;
              }
            })
            .then((res) => {
              if (res) {
                var uploadObjectKey = objectKey + "_" + size;
                console.log(`uploading ${uploadObjectKey}`);
                return s3.upload(
                  { ...uploadParams, Key: uploadObjectKey, Body: res },
                  function (err, data) {
                    if (err) {
                      console.log(err, err.stack);
                    } else {
                      console.log("S3 compressed object upload successful.");
                    }
                  }
                );
              } else return;
            })
            .catch((err) => {
              console.log(err, err.stack);
            });
        };

        if (acceptedExt.indexOf(type.ext) >= 0) {
          if (type.ext === "heic") {
            heicToJpg(data.Body);
          } else {

            retrieveRekognitionLabels(rekognitionParams)
            Promise.all([
              ...qualityArray.map(resizeQuality),
              ...widthArray.map(resizeWidth),
            ]).then(() => {
              console.log("All image uploads completed successfully.");
            });
          }
        } else {
          console.log("Image is not an accepted format");
        }
      }
    });
  } else {
    console.log(`Ending process for ${objectKey}`);
  }
};
