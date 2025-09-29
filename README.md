# UK Immigration Interactive World Map

## **Introduction: Project Overview and Core Technologies**

This project is a full-stack web application designed to transform UK government statistical data presented as a csv into an interactive geospatial visualisation.

At a high level, the application visualises UK visa application statistics from 2005 to 2025 on an interactive world map. Users can filter data by year, quarter, and application outcome, and click on individual countries to see a detailed breakdown of visa types.

#### Key Technologies

| Layer                 | Technologies                               |
| --------------------- | ------------------------------------------ |
| **Backend**     | Flask, SQLAlchemy                          |
| **Database**    | SQLite managed via SQLAlchemy             |
| **Frontend**    | JavaScript (ES6+), amCharts 5, HTML5, CSS3 |
| **Environment** | Python Virtual Environment (venv), Dotenv  |

### **Live Demo & Key Visuals**

The following links provide access to the live deployment and a visual demonstration of its core interactive features.

**Live Application:** [Link to Deployed Application]

---

## 1. Core Features & User Experience

### **Interactive Geospatial Heatmap**

The center of the application is a world map that uses a color-coded heatmap to represent the total number of visa decisions for each country organised by year. This provides an immediate visual understanding of global immigration patterns to the UK and hotspots, with data dynamically sourced from the `/api/map-data` endpoint.

### **In-Depth Country View**

Clicking on any country on the map triggers a pop-up modal containing a detailed pie chart. This feature allows users to transition from a macro-level overview of global trends to a micro-level analysis of the specific visa type breakdowns (e.g., Work, Study, Family) for a single nation, powered by the dynamic `/api/pie_chart/<country_code>` endpoint.

### **Data Filtering**

Users have control over the visualised dataset through a series of filters. The entire dataset can be filtered by Year, Quarter, and Application Outcome (Issued, Refused, Withdrawn). Furthermore, users can include or exclude major visa categories like "Work" or "Study".

### **Responsive Tooltips and Legend**

Informative tooltips appear when a user hovers over a country, showing its name and the pie chart with count for each visa category for the selected period.

Also there is a static legend permanently displayed on the interface (desgined to work only for the "Issued" application outcome) which serve to explain the heatmap's color scale, ensuring that the data visualisations are easy to interpret.

## 2. Technical Architecture and Implementation Overview

This section deconstructs the application's architecture to showcase the technical decisions that I made.

### **2.1. Backend: Flask & RESTful API**

The backend uses RESTful API built with Flask. Its primary responsibilities are to serve the frontend application, expose data endpoints for the visualisation library, and handle all interactions with the database via the SQLAlchemy ORM.

The API exposes two primary data endpoints:

* `<b>GET /api/map-data</b>`: This endpoint aggregates the total number of visa decisions for all countries to power the main heatmap visualisation. The underlying database query is dynamic, incorporating optional filters for `year`, `quarter`, `status`, and `exclude_groups` passed as URL query parameters. This allows the frontend to request precisely the data it needs to render the map based on user selections. As previously mentioned, **this endpoint is optimized specifically for visualizing successful applications and will return an empty dataset if the `status` is set to anything other than 'Issued'.**
* `<b>GET /api/pie_chart/<country_code></b>`: This endpoint provides a detailed breakdown of visa types for a single country, identified by its ISO code in the URL path. It performs a targeted database query, filtering by country and applying the same set of URL parameters as the map data endpoint, to deliver the data needed for the pop-up pie chart.

A key challenge in this project was handling inconsistencies between country names in the official government dataset and the standardized names used by the `pycountry` library for ISO code conversion. To solve this, a data-cleaning functionality was implemented using helper functions.

The `get_iso_from_name` function leverages a `COUNTRY_SPECIAL_CASES` dictionary to manually map non-standard names before falling back to the library's fuzzy search.

The `get_name_from_iso` function is used for the `/api/pie_chart/<country_code>` endpoint, translating the incoming ISO code from the URL back into the full country name required for database queries.

```python
# Helper functions for country code conversion
# This dictionary handles special cases where country names do not match pycountry's naming conventions
COUNTRY_SPECIAL_CASES = {
    "RU": "Russia", "GB": "United Kingdom", "US": "United States", "TZ": "Tanzania",
    "LA": "Laos", "IR": "Iran", "KR": "South Korea", "KP": "North Korea", "VN": "Vietnam",
    "SY": "Syria", "MD": "Moldova", "BO": "Bolivia", "VE": "Venezuela", "BN": "Brunei",
    "TW": "Taiwan", "FM": "Micronesia", "CV": "Cape Verde", "CG": "Congo",
    "MK": "North Macedonia", "SZ": "Swaziland", "TL": "Timor-Leste", 
    "WS": "Samoa", "SM": "San Marino", "ST": "Sao Tome and Principe", 
    "SC": "Seychelles", "SB": "Solomon Islands", "SR": "Suriname", "TJ": "Tajikistan", 
    "VA": "Vatican City", "TR": "Turkey", "PS": "Occupied Palestinian Territories", 
    "CI": "Ivory Coast", "MM": "Myanmar (Burma)", "CD": "Congo (Democratic Republic)", 
    "GM": "Gambia, The", "KN": "St Kitts and Nevis",
    "LC": "St Lucia", "BS": "Bahamas, The", "VC": "St Vincent and the Grenadines",
    "XK": "Kosovo", "NE": "Niger"
}

# Create the reverse mapping for name-to-ISO lookups
ISO_TO_NAME_SPECIAL_CASES = {v: k for k, v in COUNTRY_SPECIAL_CASES.items()}

def get_iso_from_name(country_name):
    """
    Converts a country name to its 2-letter ISO 3166-1 alpha-2 code.
    It first checks a manual override dictionary for known inconsistencies
    before attempting a fuzzy search with the pycountry library.
    """
    if country_name in ISO_TO_NAME_SPECIAL_CASES:
        return ISO_TO_NAME_SPECIAL_CASES[country_name]
    try:
        # A fuzzy search that will find a match even with small spelling differences.
        country = pycountry.countries.search_fuzzy(country_name)
        if country:
            return country[0].alpha_2
    except LookupError:
        return None # Return None if pycountry fails to find anything.
    return None
```

### **2.2. Database & Data Ingestion**

The database schema is defined using the SQLAlchemy ORM, which maps Python classes to database tables. The core table is represented by the `ImmigrationStats` model, which includes key columns such as `Year`, `Quarter`, `Nationality`, `Region`, `Visa_type_group`, `Case_outcome`, and `Decisions`. This object-relational mapping simplifies database interactions and ensures a maintainable data structure.

The data ingestion pipeline, handled by the `populate_db_from_csv` script, is engineered with the following feeatures:

* **Efficient Batch Processing:** The script uses `db.session.bulk_save_objects()` to insert thousands of records into the database in a single, efficient transaction. This approach is significantly faster and less resource-intensive than committing each record individually.
* **Data Cleaning:** Data from the source CSV is cleaned and validated during ingestion. A `try...except` block handles potential `ValueError` exceptions when converting `Year` and `Decisions` fields to integers. This includes logic to strip commas from numeric strings, preventing the entire script from failing due to a single malformed row.
* **Automated Schema Management:** The script includes `db.drop_all()` and `db.create_all()` commands, which allow the database schema to be reset and recreated. This is used to ease the development, testing, and ensuring a consistent database state.

### **2.3. Frontend: Dynamic Visualisation with amCharts 5**

The frontend is a dynamic, single-page-style interface built with vanilla JavaScript (ES6+) and the powerful `amCharts 5` data visualisation library. This approach delivers a responsive user experience without the overhead of a large frontend framework. The map is intentionally configured to exclude non-state territories like Antarctica (`AQ`) to focus the visualisation on relevant immigration data.

Core application logic is managed through a state management system. Event listeners on the filter dropdowns (e.g., `year-select`) and visa type checkboxes (`.visa-type-filter`) update global JavaScript variables like `selectedYear` and `excludedVisaGroups`. Any change to these state variables immediately triggers the `updateMapData()` and, if a country is selected, `updatePieChart()` functions to fetch new data and re-render the visualisations.

Communication with the backend is handled asynchronously using the browser's native `fetch` API. When a user changes a filter, a request is sent to the appropriate Flask API endpoint. Upon receiving a JSON response, the `.then(data => ...)` promise block is executed, which dynamically updates the chart's data source using amCharts methods like `polygonSeries.data.setAll(data)`. This ensures that the UI updates feel instantaneous to the user.

```javascript
function updateMapData() {
    if (!selectedYear || !selectedQuarter || !selectedStatus) {
        return; // Don't fetch if filters aren't ready
    }
    const excludeGroupsParam = Array.from(excludedVisaGroups).join(',');
    const url = `/api/map-data?year=${selectedYear}&quarter=${selectedQuarter}&status=${selectedStatus}&exclude_groups=${excludeGroupsParam}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            polygonSeries.data.setAll(data);
        })
        .catch(error => {
            console.error("Error fetching map data:", error);
            polygonSeries.data.setAll([]);
        });
}
```

## 3. Local Installation and Setup

The following steps provide a guide to clone the repository, set up the environment, and run the application on a local machine.

1. Clone the Repository: `git clone [repository-url]`
2. Navigate into the newly created project directory: `cd [repository-name]`
3. Create and Activate a Virtual Environment: creating the environment -> ` python -m venv venv`; activating it  on Windows -> `venv\Scripts\activate` ; activating it on Mac `source venv/bin/activate`
4. Install Dependencies: `pip install -r requirements.txt`
5. Configure Environment Variables: Create a file named `.env` in the project root. This file should contain the necessary configuration variables, primarily the database URI: `FLASK_SQLALCHEMY_DATABASE_URI=sqlite:///immigration.sqlite3`
   `FLASK_SQLALCHEMY_ECHO=True`
6. Initialize and Populate the Database: Run the data population script from your terminal `python populate_db_from_csv.py`. This will create the database file and load it with data from `data/Immigration.csv`
7. Run the Flask Application: `flask run`
8. Access the Application: Open your web browser and navigate to `http://127.0.0.1:5000`

**If you would like to contribute, you are welcome to do so! Please follow these guidelines:**

1. Fork the repository and create your branch.
2. Make your changes and submit a pull request.
3. For major changes, open an issue first to discuss your ideas.

## 4. Potential Future Enhancements

* **Data Caching:** Implement a caching layer (e.g., Redis) to store common API query results. This would improve API response times for frequently viewed data, enhancing the user experience while reducing database load and operational costs.
* **Advanced Visualisations:** Introduce a time-series line graph in the drill-down modal to track a nation's trends over several years. This transforms the tool from a point-in-time snapshot into a longitudinal analysis platform, offering deeper insights.
* **Deployment & CI/CD:** Containerize the application with Docker and build a CI/CD pipeline using GitHub Actions. This would ensure repeatable, reliable deployments and accelerate the development lifecycle.
* **User Accounts & Saved Searches:** Add user authentication to enable personalized features like saved filter presets and bookmarked visualisations. This adds user value, encourages repeat engagement, and establishes the beginnings for a more helpful analytics platform.

## 5. References

- [amCharts Documentation](https://www.amcharts.com/docs/v5/)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [UK Home Office Immigration Data](https://www.gov.uk/government/collections/immigration-statistics-quarterly-release)
