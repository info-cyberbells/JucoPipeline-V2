// Extract "2025" from "2025-26"
function getSeasonStartYear(seasonYear) {
    if (!seasonYear) return null;
    return parseInt(seasonYear.split("-")[0], 10);
}

// Find record for a specific season year
function getSeasonDataByYear(arr = [], targetYear) {
    if (!Array.isArray(arr) || !targetYear) return null;

    return arr.find(item => {
        const year = getSeasonStartYear(item.seasonYear);
        return year === targetYear;
    }) || null;
}

// Get latest season year from array
function getLatestSeasonYear(arr = []) {
    let latest = null;

    for (const item of arr) {
        const year = getSeasonStartYear(item.seasonYear);
        if (year && (!latest || year > latest)) {
            latest = year;
        }
    }

    return latest;
}

// Get File Type
const getFileType = (url = "") => {
    const ext = url.split('.').pop().toLowerCase();

    const imageExt = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
    const pdfExt = ["pdf"];
    const csvExt = ["csv", "xlsx"];

    if (imageExt.includes(ext)) return "image";
    if (pdfExt.includes(ext)) return "pdf";
    if (csvExt.includes(ext)) return "csv";

    return "other";
};

// FORMATTER
export const formatUserDataUtility = (userDoc, baseURL) => {
    const user = userDoc.toObject ? userDoc.toObject() : userDoc;

    // console.log("Formatting user data for user ID:", user);
    // return false
    // ---------------------------
    // FORMAT FILE URLS
    // ---------------------------
    if (user.profileImage && !user.profileImage.startsWith("http")) {
        user.profileImage = `${baseURL}${user.profileImage}`;
    }

    // if (user.photoIdDocument?.documentUrl && !user.photoIdDocument.documentUrl.startsWith("http")) {
    //     user.photoIdDocument.documentUrl = `${baseURL}${user.photoIdDocument.documentUrl}`;
    // }

    // if (Array.isArray(user.photoIdDocuments)) {
    //     user.photoIdDocuments = user.photoIdDocuments.map(doc => ({
    //         ...doc,
    //         documentUrl: doc.documentUrl?.startsWith("http") ? doc.documentUrl : `${baseURL}${doc.documentUrl}`
    //     }));
    // }

    if (user.photoIdDocument?.documentUrl) {
        let url = user.photoIdDocument.documentUrl;

        if (!url.startsWith("http")) {
            url = `${baseURL}${url}`;
        }

        user.photoIdDocument.documentUrl = url;
        user.photoIdDocument.fileType = getFileType(url);
    }

    if (Array.isArray(user.photoIdDocuments)) {
        user.photoIdDocuments = user.photoIdDocuments.map(doc => {
            let url = doc.documentUrl;

            if (url && !url.startsWith("http")) {
                url = `${baseURL}${url}`;
            }

            return {
                ...doc,
                documentUrl: url,
                fileType: getFileType(url)
            };
        });
    }


    // Videos
    if (Array.isArray(user.videos)) {
        user.videos = user.videos.map(video => ({
            ...video,
            url: video.url?.startsWith("http") ? video.url : `${baseURL}${video.url}`
        }));
    }

    // Coach Recommendation
    if (user.coachRecommendation?.url && !user.coachRecommendation.url.startsWith("http")) {
        user.coachRecommendation.url = `${baseURL}${user.coachRecommendation.url}`;
    }

    // Academic Info
    if (user.acedemicInfo?.url && !user.acedemicInfo.url.startsWith("http")) {
        user.acedemicInfo.url = `${baseURL}${user.acedemicInfo.url}`;
    }


    // ---------------------------
    // SEASON BASED DATA LOGIC
    // ---------------------------
    const latestSeasonYear = getLatestSeasonYear(user.playerBasicInfo || []);

    const basic = getSeasonDataByYear(user.playerBasicInfo, latestSeasonYear) || {};
    const batting = getSeasonDataByYear(user.battingStats, latestSeasonYear);
    const fielding = getSeasonDataByYear(user.fieldingStats, latestSeasonYear);
    const pitching = getSeasonDataByYear(user.pitchingStats, latestSeasonYear);

    // ---------------------------
    // FLATTEN TO OLD STRUCTURE
    // ---------------------------
    // user.team = basic.team || user.team || null;
    if (basic.team) {
        // If existing team is already a populated object, don't overwrite it
        if (!user.team || typeof user.team === "string" || user.team instanceof String) {
            user.team = basic.team;
        }
    }

    user.jerseyNumber = basic.jerseyNumber || null;
    user.position = basic.position || null;
    user.primaryPosition = basic.primaryPosition || null;
    user.height = basic.height || null;
    user.weight = basic.weight || null;
    user.batsThrows = basic.batsThrows || null;
    user.hometown = basic.hometown || null;
    user.highSchool = basic.highSchool || null;
    user.previousSchool = basic.previousSchool || null;
    user.playerClass = basic.playerClass || null;

    user.region = basic.region || null;
    user.velo = basic.velo || null;
    // user.whip = basic.whip || null;
    user.player_bio = basic.player_bio || null;
    user.awards_honors = basic.awards_honors || null;
    user.strengths = basic.strengths || [];
    user.awardsAchievements = basic.awardsAchievements || [];

    user.academic_info_gpa = basic.academic_info_gpa || null;
    user.academic_info_sat = basic.academic_info_sat || null;
    user.academic_info_act = basic.academic_info_act || null;

    user.ncaaId = basic.ncaaId || null;
    user.playerScore = basic.playerScore || null;
    // user.jpRank = basic.jpRank || null;
    user.conferenceStrengthScore = basic.conferenceStrengthScore || null;
    user.transferStatus = basic.transferStatus || [];

    // Only send selected season stats (OLD behavior)
    user.battingStats = batting ? [batting] : [];
    user.fieldingStats = fielding ? [fielding] : [];
    user.pitchingStats = pitching ? [pitching] : [];

    // REMOVE NEW STRUCTURE FROM RESPONSE
    delete user.playerBasicInfo;

    // NEVER SEND PASSWORD
    delete user.password;

    return user;
};
