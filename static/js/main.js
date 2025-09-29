
// Preventing bfcache issues by forcing a reload when navigating back to the page
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        window.location.reload();
    }
});


// Creating a shortcut for the amCharts 5 pie chart module
const am5pie = am5percent;

/**
 * Main amCharts 5 code block
 */
am5.ready(function() {
    
    // 1. Initial setup of the map and its state when the user first loads the page; it includes heatmap setup and some features of pie chart 
    
    // Manages the set of visa groups to be excluded from API queries. A Set is used for efficient addition and to prevent duplicates.
    let excludedVisaGroups = new Set(); 

    // Defines the data threshold and corresponding colors for the map's heat legend

    const heatLegendData = [
        { label: "Over 100,000", value: 100001, color: am5.color(0xD50000) },
        { label: "50,001 - 100,000", value: 50001, color: am5.color(0xFF5722) },
        { label: "10,001 - 50,000", value: 10001, color: am5.color(0xFF9800) },
        { label: "1,001 - 10,000", value: 1001, color: am5.color(0xFFC107) },
        { label: "1 - 1,000", value: 1, color: am5.color(0xFFEB3B) }
    ];

    // DOM references for the pie chart container and its close button
    const pieContainer = document.getElementById('piechart-container');
    const closeBtn = document.getElementById('close-piechart-btn')


    // Attaching a click event to the close button to hide the pie chart container 
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            pieContainer.style.display = 'none';
        });
    }


    // Initializing the root element and theme for the main map chart
    let root = am5.Root.new("chartdiv");
    root.setThemes([am5themes_Animated.new(root)]);

    // Creating the map chart instance
    let chart = root.container.children.push(
        am5map.MapChart.new(root, {})
    );

    // Creating the polygon series which will draw the countries on the map
    let polygonSeries = chart.series.push(
        am5map.MapPolygonSeries.new(root, {
            geoJSON: am5geodata_worldLow,
            exclude: ["AQ", "GS", "TF", "HM"], // Excluding Antarctica and some small islands
            valueField: "value",
            idField: "id"
        })
    );

    // Configuring the default appearance and behavior for all country polygons
    polygonSeries.mapPolygons.template.setAll({
        tooltipText: "{name}", // Shows country name on hover
        interactive: true,
        cursorOverStyle: "pointer",
        // The default to fill for countries with no data
        fill: am5.color(0xcccccc), //Neutral grey
        stroke: am5.color(0xffffff),
        strokeWidth: 0.5
    });


    /**
     * This adapter dynamically sets the fill colour of each country polygon based on its data value,
     * creating the heatmap effect. It runs for every polygon on the map.
     */
    polygonSeries.mapPolygons.template.adapters.add("fill", function(fill, target) {
        // Keeping the hover state colour if the country is being hovered over
        if (target.isHover()) {
            return fill;
        }
        // Getting the numerical value from the polygon's data item
        const value = target.dataItem.get("value");
        
        // Finding the appropriate color rule from the legend data
        const heatRule = heatLegendData.find(rule => value >= rule.value);
        
        // Returning the heatmap colour if a rule is matched, otherwise returning the default fill colour
        return heatRule ? heatRule.color : fill;
    });


    // Defining what the hover state looks like for each country polygon
    polygonSeries.mapPolygons.template.states.create("hover", {
      fill: am5.color(0xCCCCCC) 
    });


    /**
     * This adapter customizes the tooltip text. It shows the detailed value
     * only if the country has data associated with it.
     */
    polygonSeries.mapPolygons.template.adapters.add("tooltipText", function(text, target) {
        let dataContext = target.dataItem.dataContext;
        // If the data item has a value, showing it in the tooltip
        if (dataContext.value) { 
            return "{name}: {value}";
        }
        // Otherwise, showing the default text
        return "{name}: click for details (if data is available)";
    });


    // 2. Pie chart setup

    // Initializing the root elment and theme for the pie chart 
    let pieRoot = am5.Root.new("piechart-div");
    pieRoot.setThemes([am5themes_Animated.new(pieRoot)]);

    // Creating the pie chart instance
    let pieChart = pieRoot.container.children.push(
        am5pie.PieChart.new(pieRoot, {
            radius: am5.percent(70),
            layout: pieRoot.verticalLayout,
            paddingBottom: 30,
        })
    );

    // Creating anf configuring a dynamic title for the pie chart
    let pieTitle = pieChart.children.unshift(am5.Label.new(pieRoot, {
        text: "Hover over a country",
        fontSize: "1.2em",
        fontWeight: "bold",
        textAlign: "center",
        x: am5.percent(50),
        centerX: am5.percent(50),
        paddingBottom: 10
    }));

    // Creating the pie series which will hold the data
    let pieSeries = pieChart.series.push(
        am5pie.PieSeries.new(pieRoot, {
            valueField: "decisions",
            categoryField: "visa_type",
            legendLabelText: "{category}: {value}",
            legendValueText: ""
        })
    );

    // Configuring the appearance of pie slices
    pieSeries.labels.template.set("forceHidden", true);
    pieSeries.ticks.template.set("forceHidden", true);

    // Creating and configuring the legend for the pie chart
    let legend = pieChart.children.push(
        am5.Legend.new(pieRoot, {
            centerX: am5.percent(50),
            x: am5.percent(50),
            marginTop: 15,
            layout: am5.GridLayout.new(pieRoot, {
                maxColumns: 4,
                fixedWithGrid: true
            })
        })
    );
    // Linking the legend data to the pie series data items
    legend.data.setAll(pieSeries.dataItems);


    // 3. Filter setup and state management 

    const yearSelect = document.getElementById("year-select");
    const quarterSelect = document.getElementById("quarter-select");
    const statusSelect = document.getElementById("status-select");

    // Populating the year dropdown dynamically
    for (let y = 2005; y <= 2025; y++) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        yearSelect.appendChild(option);
    }

    // Populating the quarter dropdown dynamically
    let selectedYear = null, selectedQuarter = null, selectedStatus = "Issued";

    // Variables to keep track of the currently selected country for pie chart updates
    let currentCountryId = null;
    let currentCountryName = null;
    
    /**
     * Fetches aggregated data for the world map from the backend API
     * based on the current filter selections and updates the map series.
     */
    function updateMapData() {
        if (!selectedYear || !selectedQuarter || !selectedStatus) {
            return; // Exit if any filter is not selected
        }
        // Converting the Set of excluded groups into a comma-separated string for the URL parameter.
        const excludeGroupsParam = Array.from(excludedVisaGroups).join(',');
        const url = `/api/map-data?year=${selectedYear}&quarter=${selectedQuarter}&status=${selectedStatus}&exclude_groups=${excludeGroupsParam}`;
    
        // Fetch the data from the API and update the map series
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

    /**
     * Fetches detailed visa data for a specific country from the backend API
     * and updates the pie chart with the results.
     * @param {string} countryId - The 2-letter ISO code of the country.
     * @param {string} countryName - The full name of the country for display.
     */
  
    function updatePieChart(countryId, countryName) {
        // Check if all dropdowns have been selected
        if (!selectedYear || !selectedQuarter || !selectedStatus) {
            pieTitle.set("text", "Please select year, quarter, and status");
            pieSeries.data.setAll([]); // Clear old data
            return; // Stop the function here
        }

        // Providing immediate feedback to the user that data is being loaded.
        pieTitle.set("text", `Loading data for ${countryName}...`);

        const excludeGroupsParam = Array.from(excludedVisaGroups).join(',');
        const url = `/api/pie_chart/${countryId}?year=${selectedYear}&quarter=${selectedQuarter}&status=${selectedStatus}&exclude_groups=${excludeGroupsParam}`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                // Handling the case where the API returns no data
                if (!data || data.length === 0) {
                    pieTitle.set("text", `${countryName}: No data`);
                    pieSeries.data.setAll([]);
                    legend.data.setAll([]);
                    return;
                }
                // On success, setting the title and data
                pieTitle.set("text", countryName);
                pieSeries.data.setAll(data);
                legend.data.setAll(pieSeries.dataItems);
            })
            .catch(error => {
                console.error("Error fetching data:", error);
                pieTitle.set("text", `${countryName}: Could not load data`);
                pieSeries.data.setAll([]); // Clear data on error
            });
    }

    /**
     * Renders the static HTML legend for the heatmap based on the heatLegendData array.
     */
    function buildLegend() {
        const legendContainer = document.getElementById("map-legend");
        legendContainer.innerHTML = ""; // Clearing old legend items

        heatLegendData.forEach(item => {
            const legendItem = document.createElement("div");
            legendItem.className = "legend-item";
            
            const colorBox = document.createElement("div");
            colorBox.className = "legend-color-box";
            colorBox.style.backgroundColor = item.color.toCSS();
            
            const label = document.createElement("span");
            label.textContent = item.label;
            
            legendItem.appendChild(colorBox);
            legendItem.appendChild(label);
            
            legendContainer.appendChild(legendItem);
        });
    }

    // Attaching event listeners to each dropdown filter. On change, update the state,
    // refresh the map data, and refresh the pie chart if it is currently visible
    yearSelect.addEventListener("change", function() {
        selectedYear = this.value;
        updateMapData();
        if (pieContainer.style.display === 'block' && currentCountryId) {
            updatePieChart(currentCountryId, currentCountryName);
        }
    });

    quarterSelect.addEventListener("change", function() {
        selectedQuarter = this.value;
        updateMapData();
        if (pieContainer.style.display === 'block' && currentCountryId) {
            updatePieChart(currentCountryId, currentCountryName);
        }
    });

    statusSelect.addEventListener("change", function() {
        selectedStatus = this.value;
        updateMapData();
        if (pieContainer.style.display === 'block' && currentCountryId) {
            updatePieChart(currentCountryId, currentCountryName);
        }
    });

// Getting references to all the visa group filter checkboxes.
const visaGroupCheckboxes = document.querySelectorAll('.visa-type-filter'); 

/**
* Handles changes on any visa group checkbox. It rebuilds the list of
* excluded groups and triggers a data refresh for the map and pie chart.
*/
function handleVisaGroupFilterChange() {
    excludedVisaGroups.clear(); // Starting with an empty exclusion list

    // Loop through all checkboxes and add the value of any that are currently unchecked 
    visaGroupCheckboxes.forEach(checkbox => {
        if (!checkbox.checked) {
            excludedVisaGroups.add(checkbox.value);
        }
    });

    // Refreshing the map and pie chart with the new exclusion list
    updateMapData();
    if (pieContainer.style.display === 'block' && currentCountryId) {
        updatePieChart(currentCountryId, currentCountryName);
    }
}

    // Triggering a refresh of the visualization with the new filters
    visaGroupCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleVisaGroupFilterChange);
    });


    // 4. Configuring the defaut view
    
    // Setting initial dropdown values and trigger first map data load
    yearSelect.value = "2025";
    quarterSelect.value = "Q1";
    statusSelect.value = "Issued";

    // Updating the selected filter state variables to match the initial dropdown values
    selectedYear = yearSelect.value;
    selectedQuarter = quarterSelect.value;
    selectedStatus = statusSelect.value;

    // Building the map's static legend and trigger the first data load for the map view
    buildLegend(); 
    updateMapData(); 


    // 5. Map interactivity

    // Adding a click event to each country polygon to show the pie chart with detailed data
    polygonSeries.mapPolygons.template.events.on("click", function(event) {
        // Showing the pie chart container
        pieContainer.style.display = "block";

        // Storing the clicked country's ID and name
        currentCountryId = event.target.dataItem.get("id");
        currentCountryName = event.target.dataItem.dataContext.name;
        
        // Calling the reusable function to fetch and display the data
        updatePieChart(currentCountryId, currentCountryName);
    });

}); // End of am5.ready