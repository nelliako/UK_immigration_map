from flask import Flask, render_template, jsonify, request
from sqlalchemy import func
from extensions import db
from dotenv import load_dotenv 
import pycountry


# Load variables from a .env file
load_dotenv()


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

# Creating the reverse mapping automatically for the other function
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


def get_name_from_iso(iso_code):
    """
    Converts a 2-letter ISO code to a country name.
    It first checks a manual override dictionary to handle special cases.
    """
    iso_code = iso_code.upper()
    if iso_code in COUNTRY_SPECIAL_CASES:
        return COUNTRY_SPECIAL_CASES[iso_code]
    try:
        country = pycountry.countries.get(alpha_2=iso_code)
        return country.name
    except (KeyError, AttributeError):
        # This handles cases where the code is valid but not in the library.
        return None


# Creating Flask app, defining routes and runnin the server

def create_app():
    """Create and configure the Flask app instance."""
    app = Flask(__name__) # Creates the app instance
    app.config.from_prefixed_env() # This is for loading configuration (like database URLs) securely, not hard-coding them
    db.init_app(app) # This links my database extension to my specific app instance
    return app


app = create_app()


@app.route('/')
def home():
    """Serves the main HTML page for the map."""
    return render_template('index.html')


@app.route('/about')
def about():
     """Serves the about page with explanation of the data sources and the project purpose."""
     return render_template('about.html')


#API Endpoints

@app.route('/api/pie_chart/<country_code>')
def get_pie_chart_data(country_code):
    """
    API endpoint to fetch a detailed breakdown of visa types for a single
    country, used to populate the pop-up pie chart.
    """

    # Importing the model here to avoid circular imports
    from models import ImmigrationStats
    
    # Getting query parameters from the request URL (e.g. ?year=2024&status=Issued)
    year = request.args.get('year', type=int)
    quarter = request.args.get('quarter', type=str)
    status = request.args.get('status', type=str)

    # Handling visa group exclusions
    exclude_groups_str = request.args.get('exclude_groups', '') # Getting a comma-separated string like "Work, Study"
    excluded_groups_list = exclude_groups_str.split(',') if exclude_groups_str else []

    # Validating required parameters
    if not all([year, quarter, status]):
        return jsonify({"error": "Missing year, quarter, or status parameter"}), 400

    # Converting the incoming ISO code from the URL into the full country name needed for the database query
    country_name = get_name_from_iso(country_code)
    if not country_name:
        return jsonify({"error": "Country not found"}), 404


# Building the database query using SQLAlchemy

# 1. Base query: selecting the visa group and summing decisions
    query = db.select(
        ImmigrationStats.Visa_type_group,
        func.sum(ImmigrationStats.Decisions).label("total_decisions")
    ).filter(
        ImmigrationStats.Nationality.ilike(country_name),
        ImmigrationStats.Case_outcome.ilike(status)
    )

# 2. Adding the conditional filter for excluded visa groups
    if excluded_groups_list:
        query = query.filter(ImmigrationStats.Visa_type_group.notin_(excluded_groups_list))

# 3. Adding the conditional filter for the time period
    if quarter == "Total":
        query = query.filter(ImmigrationStats.Quarter.like(f"{year} %"))
    else:
        full_quarter_string = f"{year} {quarter}"
        query = query.filter(ImmigrationStats.Quarter.ilike(full_quarter_string))
        
# 4. Grouping the results by visa type and ordering by the total decisions in descending order
    query = query.group_by(
        ImmigrationStats.Visa_type_group
    ).order_by(
        func.sum(ImmigrationStats.Decisions).desc()
    )

# 5. Executing the query 
    stats = db.session.execute(query).all()
    
    if not stats:
        return jsonify([])
    
# 6. Formatting the results into a list of dictionaries for JavaScript
    results = [
        {"visa_type": visa_type, "decisions": total}
        for visa_type, total in stats
    ]
    return jsonify(results)


@app.route('/api/map-data')
def get_map_data():
    """
    Fetches aggregated "Issued" visa data for all countries for the map heatmap.
    This query groups by country and sums up all decisions.
    """
    from models import ImmigrationStats
    
    # Getting optional filters from the request URL (e.g., /api/map-data?year=2024)
    year = request.args.get('year', type=int)
    quarter = request.args.get('quarter', type=str)
    status = request.args.get('status', 'Issued', type=str) # Default to "Issued" 

    # Handling visa group exclusions
    exclude_groups_str = request.args.get('exclude_groups', '')
    excluded_groups_list = exclude_groups_str.split(',') if exclude_groups_str else []

    # This endpoint is specifically for "Issued" visas (not "Refused" or "Withdrawn")
    if status != "Issued":
        return jsonify([])


    # Building the database query

    # 1. Selecting the country name and the sum of decisions.
    query = db.select(
        ImmigrationStats.Nationality,
        func.sum(ImmigrationStats.Decisions).label("total_value")
    ).group_by(ImmigrationStats.Nationality) # Group results for each country

    # 2. Conditionally adding filters based on URL parameters
    if excluded_groups_list:
        query = query.filter(ImmigrationStats.Visa_type_group.notin_(excluded_groups_list))

    if status:
        query = query.filter(ImmigrationStats.Case_outcome.ilike(status))
    
    if year:
        if quarter and quarter != "Total":
            full_quarter_string = f"{year} {quarter}"
            query = query.filter(ImmigrationStats.Quarter.ilike(full_quarter_string))
        else:
            query = query.filter(ImmigrationStats.Year.ilike(f"{year}"))

    # 3. Executing the query 
    stats = db.session.execute(query).all()

    # 4. Formatting the results for the map library
    results = []

    for country_name, total in stats:
        # Convert the country name to its ISO code for the map library
        iso_code = get_iso_from_name(country_name)
        
        # Only adding the country if a valid ISO code is found for it
        if iso_code:
            results.append({
                "id": iso_code,
                "value": total or 0  # Default to 0 if total is None
            })


    return jsonify(results)


if __name__ == '__main__':
    app.run(debug=True)
