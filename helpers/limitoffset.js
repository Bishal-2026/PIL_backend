
const paginate = async (
  model,
  query = {},
  page = 0,
  limit = 10,
  populateFields = [],
  searchFields = [],
  searchTerm = "",
  sort = null
) => {
  page = parseInt(page) || 0;
  limit = parseInt(limit) || 10;
  const skip = page * limit;

  console.log("🔹 Search Term Before Processing:", searchTerm);

  try {
    let searchQuery = { ...query };

    if (
      typeof searchTerm === "string" &&
      searchTerm.trim().length > 0 &&
      searchFields.length > 0
    ) {
      // Escape special regex characters
      const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escapedSearchTerm, "i");

      const schemaPaths = model.schema.paths;

      const searchConditions = searchFields
        .filter((field) => {
          // Robust check for field existence; handles nested fields if dot notation is supported in schema.paths
          const path = schemaPaths[field];
          return path && (path.instance === "String" || path.options?.type === String);
        })
        .map((field) => ({
          [field]: { $regex: searchRegex },
        }));

      if (searchConditions.length > 0) {
        if (Object.keys(searchQuery).length > 0) {
          // If we already have filters, we use an implicit AND by adding $or to the existing query object.
          // However, if the existing query already has an $or, we must use $and to combine them.
          if (searchQuery.$or) {
            searchQuery = {
              $and: [
                { ...searchQuery },
                { $or: searchConditions }
              ]
            };
          } else {
            searchQuery.$or = searchConditions;
          }
        } else {
          searchQuery = { $or: searchConditions };
        }
      }
    }

    console.log("🔍 Final MongoDB Query:", JSON.stringify(searchQuery, null, 2));

    const totalrecords = await model.countDocuments(searchQuery);

    // If skip is beyond total records and we have data, reset to first page
    // This handles the case where a user searches while on a high page number
    let adjustedPage = page;
    let adjustedSkip = skip;
    if (totalrecords > 0 && skip >= totalrecords) {
      adjustedPage = 0;
      adjustedSkip = 0;
    }

    let queryExec = model.find(searchQuery);
    if (sort && typeof sort === "object") {
      queryExec = queryExec.sort(sort);
    }
    queryExec = queryExec.skip(adjustedSkip).limit(limit);

    if (populateFields.length) {
      populateFields.forEach((field) => {
        queryExec = queryExec.populate(field);
      });
    }

    const data = await queryExec;
    console.log("📌 Retrieved Records:", data.length);

    return {
      status: true,
      message:
        data.length > 0 ? "Records fetched successfully" : "No records found",
      data,
      pagination: {
        totalrecords,
        currentPage: adjustedPage,
        totalPages: Math.ceil(totalrecords / limit),
        limit
      }
    };
  } catch (error) {
    console.error("❌ Pagination Error:", error);
    throw new Error("Error fetching records");
  }
};

module.exports = paginate;
