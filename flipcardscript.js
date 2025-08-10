// Declare global variables here, so they are accessible to all functions
let data = []; // This will hold the parsed CSV data
let hasComponentData = false; // Flag to check for 'Component' data
let containerWidth, containerHeight; // Represents the dimensions of the chart-container div

// Get the container element for scoping
const myD3Chart = document.getElementById('my-d3-chart');

// Colors for individual and team weights
const individualColor = "#008dff"; // Individual (Bright Blue)
const teamColor = "#ff9d3a"; // Team (Orange)

// Highlight colors
const ORANGE = "#c701ff"; // Highlight Purple (for selected elements)
const GRAY = "#364560";  // Highlight Dark Grayish Blue (for unselected elements when others are selected)

// Current chart index for navigation
let currentChartIndex = 0; // 0: Donut, 1: Stacked Bar, 2: Horizontal Bar

// Chart-specific selection sets
let selectedDonutArcs = new Set();
let selectedStackedBars = new Set();
let selectedHorizontalBars = new Set();

// Global variable for aggregateData for donut chart
let aggregateData = [];

// Horizontal Bar Chart variables (declared outside to persist across calls)
let currentPrimarySort = 'All'; // New: Default primary sort
let currentSecondarySort = 'Weight'; // New: Default secondary sort
let horizontalBarSvg;
let horizontalBarG;
const primarySortOptions = ['All', 'Component', 'Type']; // New: Primary sort options
const secondarySortOptions = ['Weight', 'Sequence']; // New: Primary sort options
const horizontalMargin = { top: 40, right: 80, bottom: 20, left: 250 }; // Left margin for labels
let isStackedHorizontal = false; // New: State for horizontal stacked bars
let wasStackedBeforeUpdate = isStackedHorizontal; // To track changes for redraw

// Function to update chart dimensions based on container size
function updateChartDimensions() {
    const flipCard = d3.select("#my-d3-chart #flipCard");
    const flipCardRect = flipCard.node().getBoundingClientRect();

    const backCardPadding = 1.5 * 16 * 2;
    const titleHeight = 40;
    const subtitleAndSortHeight = 40;
    const availableHeightForCharts = flipCard.node().offsetHeight - backCardPadding - titleHeight - subtitleAndSortHeight;

    // Get the actual rendered width of the chart container
    const chartContainerElement = myD3Chart.querySelector('#horizontal-bar-chart-container');
    if (chartContainerElement && chartContainerElement.offsetWidth > 0) { // Ensure it's visible and has width
        containerWidth = chartContainerElement.offsetWidth;
    } else {
        // Fallback if element not yet rendered or hidden (e.g., during initial load or transition)
        // Use the max-width of the flip-card as a reasonable estimate for calculation
        containerWidth = Math.max(0, flipCardRect.width * 0.8);
    }
    containerHeight = Math.max(0, availableHeightForCharts);
}

// --- Flip Card Functionality ---
const flipCard = myD3Chart.querySelector('#flipCard');
const flipCardInner = myD3Chart.querySelector('.flip-card-inner'); // Get inner element
const flipToChartIcon = myD3Chart.querySelector('#flipToChartIcon');
const flipToTableIcon = myD3Chart.querySelector('#flipToTableIcon');
const defaultCardHeight = '600px'; // Store default height

function adjustCardHeightForTable() {
    const tableContainer = myD3Chart.querySelector('#table-container');
    // Get the scrollHeight of the table content to determine its full height
    const contentHeight = tableContainer.scrollHeight;
    // Add padding and title height from the front card to the content height
    const frontCardPadding = 1.5 * 16 * 2; // 1.5rem * 16px/rem * 2 (top+bottom)
    const titleHeight = myD3Chart.querySelector('.flip-card-front h2').offsetHeight; // Height of the title
    const totalRequiredHeight = contentHeight + frontCardPadding + titleHeight + 20; // Add a bit extra for margin/safety

    // Ensure a minimum height
    const finalHeight = Math.max(parseFloat(defaultCardHeight), totalRequiredHeight);

    flipCard.style.height = `${finalHeight}px`;
    flipCardInner.style.height = `${finalHeight}px`; // Also adjust inner
}

function resetCardHeight() {
    flipCard.style.height = defaultCardHeight;
    flipCardInner.style.height = defaultCardHeight;
}

flipToChartIcon.addEventListener('click', () => {
    flipCard.classList.add('flipped');
    flipToChartIcon.style.display = 'none';
    setTimeout(() => {
        flipToTableIcon.style.display = 'block';
    }, 800);

    resetCardHeight();

    // *** FIX: Delay rendering to allow the flip animation to start ***
    // This gives the browser time to calculate the correct dimensions of the card's back face.
    setTimeout(() => {
        renderCharts();
        updateArrowVisibility();
    }, 100); // A 100ms delay is enough for the layout to update.
});

flipToTableIcon.addEventListener('click', () => {
    flipCard.classList.remove('flipped');
    flipToTableIcon.style.display = 'none';
    setTimeout(() => {
        flipToChartIcon.style.display = 'block';
    }, 800);

    renderTable();
    // Adjust height for table view after rendering the table
    adjustCardHeightForTable();
});

// --- Arrow Navigation ---
const arrowLeft = myD3Chart.querySelector('#arrowLeft');
const arrowRight = myD3Chart.querySelector('#arrowRight');

arrowRight.addEventListener('click', () => {
    if (currentChartIndex === 0) { // Donut -> Stacked (or Horizontal if no component data)
        currentChartIndex = hasComponentData ? 1 : 2; // If no component data, skip to horizontal
    } else if (currentChartIndex === 1 && hasComponentData) { // Stacked -> Horizontal
        currentChartIndex = 2;
    }
    renderCharts();
    updateArrowVisibility(); // Keep here
});

arrowLeft.addEventListener('click', () => {
    if (currentChartIndex === 2) { // Horizontal -> Stacked (or Donut if no component data)
        currentChartIndex = hasComponentData ? 1 : 0; // If no component data, go back to donut
    } else if (currentChartIndex === 1) { // Stacked -> Donut
        currentChartIndex = 0;
    }
    renderCharts();
    updateArrowVisibility(); // Keep here
});

function updateArrowVisibility() {
    arrowLeft.classList.add('hidden');
    arrowRight.classList.add('hidden');

    if (currentChartIndex === 0) { // Donut chart
        // Always show right arrow from donut chart, as it can always navigate to the next available chart
        arrowRight.classList.remove('hidden');
    } else if (currentChartIndex === 1) { // Stacked bar chart
        arrowLeft.classList.remove('hidden'); // Can go back to donut
        arrowRight.classList.remove('hidden'); // Can go forward to horizontal
    } else if (currentChartIndex === 2) { // Horizontal bar chart
        arrowLeft.classList.remove('hidden'); // Can go back to stacked (or donut if no component data)
    }
}

// Global sort state for the table
let currentTableSort = { column: 'Deliverable', direction: 'asc' }; // Default sort

// --- D3 Table (Front Card) ---
function renderTable() {
    const tableContainer = d3.select("#my-d3-chart #table-container");
    tableContainer.html(""); // Clear previous table

    const table = tableContainer.append("table")
        .attr("class", "data-table");

    // Define the columns to be displayed in the table
    const displayColumns = ["Deliverable", "Type", "Weight"];

    // Table Header
    const headerRow = table.append("thead").append("tr");

    headerRow.selectAll("th")
        .data(displayColumns) // Use only the selected columns for headers
        .enter()
        .append("th")
        .attr("id", d => `sort-${d}`) // Add ID for click listener
        .attr("data-column", d => d) // Store column name
        .text(d => d)
        .style("text-align", d => (d === "Type" || d === "Weight") ? "right" : "left") // Apply alignment to headers
        .on("click", function(event, d) {
            const clickedColumn = d3.select(this).attr("data-column");
            if (currentTableSort.column === clickedColumn) {
                currentTableSort.direction = currentTableSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentTableSort.column = clickedColumn;
                currentTableSort.direction = 'asc'; // Default to ascending when changing column
            }
            renderTable(); // Re-render the table with the new sort
        });

    const tbody = table.append("tbody");

    // Group data by Component first
    const groupedData = d3.group(data, d => d.Component);

    // Sort component keys alphabetically to ensure consistent component order
    const sortedComponentKeys = Array.from(groupedData.keys()).sort();

    sortedComponentKeys.forEach(component => {
        // Get deliverables for the current component
        let deliverablesInComponent = groupedData.get(component);

        // Sort deliverables within this component based on currentTableSort
        deliverablesInComponent.sort((a, b) => {
            const col = currentTableSort.column;
            const dir = currentTableSort.direction;

            let comparison = 0;

            if (col === "Deliverable") { // Sort by Sequence when Deliverable is clicked
                comparison = a.Sequence - b.Sequence;
            } else if (col === "Type") {
                const valA = String(a[col]).toLowerCase();
                const valB = String(b[col]).toLowerCase();
                if (valA < valB) comparison = -1;
                if (valA > valB) comparison = 1;
            } else if (col === "Weight") {
                comparison = a.Weight - b.Weight;
            }

            return dir === 'asc' ? comparison : -comparison;
        });

        // Append a row for the component heading
        tbody.append("tr")
            .attr("class", "component-heading-row")
            .append("td")
            .attr("colspan", displayColumns.length) // Span the entire row based on displayColumns
            .style("font-weight", "bold")
            .style("background-color", "#f8fafc")
            .text(component);

        // Append rows for each deliverable within the component
        tbody.selectAll(`.deliverable-row-${component}`)
            .data(deliverablesInComponent) // Use the sorted deliverables
            .enter()
            .append("tr")
            .attr("class", `deliverable-row-${component}`)
            .selectAll("td")
            .data(d => {
                return displayColumns.map(colName => {
                    let cellContent = d[colName];
                    let style = "";
                    // Format Weight back to percentage for display
                    if (colName === "Weight") {
                        cellContent = `${(cellContent * 100).toFixed(0)}%`;
                        style += "text-align: right;"; // Right align weight
                    } else if (colName === "Type") {
                        style += "text-align: right;"; // Right align type
                    }
                    // Apply padding to the first column (Deliverable)
                    if (colName === "Deliverable") {
                        style += "padding-left: 40px;";
                    }
                    return { content: cellContent, style: style };
                });
            })
            .enter()
            .append("td")
            .attr("style", d => d.style) // Apply the style here
            .text(d => d.content);
    });

    // Add a visual indicator for the current sort column and direction
    headerRow.selectAll("th")
        .each(function(d) {
            const th = d3.select(this);
            th.select(".sort-arrow").remove(); // Remove existing arrows

            if (th.attr("data-column") === currentTableSort.column) {
                th.append("span")
                    .attr("class", "sort-arrow ml-1")
                    .html(currentTableSort.direction === 'asc' ? '&#9650;' : '&#9660;'); // Up or down arrow
            }
        });
}

// --- D3 Charts (Back Card) ---
function renderCharts() {
    // Clear all selection sets when switching charts
    selectedDonutArcs.clear();
    selectedStackedBars.clear();
    selectedHorizontalBars.clear();

    // First, apply collapsed/expanded classes to ensure correct container dimensions for updateChartDimensions
    d3.select("#my-d3-chart #donut-chart-container").classed("expanded", currentChartIndex === 0).classed("collapsed", currentChartIndex !== 0);
    d3.select("#my-d3-chart #stacked-bar-chart-container").classed("expanded", currentChartIndex === 1).classed("collapsed", currentChartIndex !== 1);
    d3.select("#my-d3-chart #horizontal-bar-chart-container").classed("expanded", currentChartIndex === 2).classed("collapsed", currentChartIndex !== 2);

    // Now, update dimensions based on the *currently visible* container
    updateChartDimensions();

    const chartSubtitle = myD3Chart.querySelector('#chart-subtitle');
    const primarySortSelect = myD3Chart.querySelector('#primarySortSelect');
    const secondarySortSelect = myD3Chart.querySelector('#secondarySortSelect');
    const stackedToggleContainer = myD3Chart.querySelector('#stackedToggleContainer'); // Get the new toggle container

    // Hide/show sort controls based on current chart
    const sortControlsDiv = myD3Chart.querySelector('.sort-controls');

    // Dynamically apply classes to chartSubtitle based on currentChartIndex
    if (currentChartIndex === 2) {
        sortControlsDiv.style.display = 'flex'; // Show for horizontal bar chart
        chartSubtitle.classList.remove('w-full', 'text-center');

        // Determine if stacking is generally possible in the dataset
        const hasIndividualTypeOverall = data.some(d => d.Type === "Individual");
        const hasTeamTypeOverall = data.some(d => d.Type === "Team");
        const canEverStack = hasIndividualTypeOverall && hasTeamTypeOverall;

        // Show/hide stacked toggle based on primary sort for horizontal chart AND if stacking is possible
        if (primarySortSelect.value !== 'Type' && canEverStack) {
            stackedToggleContainer.classList.remove('hidden');
        } else {
            stackedToggleContainer.classList.add('hidden');
            isStackedHorizontal = false; // Reset stacked state if Type is selected or cannot stack
            myD3Chart.querySelector('#stackedToggle').checked = false;
        }

    } else {
        sortControlsDiv.style.display = 'none'; // Hide for other charts
        stackedToggleContainer.classList.add('hidden'); // Always hide for other charts
        chartSubtitle.classList.remove('w-1/2', 'text-right', 'pr-2');
        chartSubtitle.classList.add('w-full', 'text-center');
    }

    // Clear content of all chart containers before drawing the active one
    d3.select("#my-d3-chart #donut-chart-container").html("");
    d3.select("#my-d3-chart #stacked-bar-chart-container").html("");
    d3.select("#my-d3-chart #horizontal-bar-chart-container").html("");

    if (currentChartIndex === 0) {
        resetCardHeight(); // Ensure default height for donut
        drawDonutChart();
        chartSubtitle.textContent = "Individual versus Team";
    } else if (currentChartIndex === 1) {
        resetCardHeight(); // Ensure default height for stacked
        if (hasComponentData) {
            drawStackedBarChart();
            chartSubtitle.textContent = "Components";
        } else {
            currentChartIndex = 2; // This is the only place currentChartIndex changes within renderCharts
            d3.select("#my-d3-chart #stacked-bar-chart-container").classed("expanded", false).classed("collapsed", true);
            d3.select("#my-d3-chart #horizontal-bar-chart-container").classed("expanded", true).classed("collapsed", false);
            drawHorizontalBarChart();
            chartSubtitle.textContent = "Deliverables";
        }
    } else if (currentChartIndex === 2) {
        drawHorizontalBarChart();
        chartSubtitle.textContent = "Deliverables";
    }
}

// Donut Chart
function drawDonutChart() {
    const container = d3.select("#my-d3-chart #donut-chart-container");
    container.html("");

    const svg = container.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    const g = svg.append("g")
        .attr("transform", `translate(${containerWidth / 2}, ${containerHeight / 2})`);

    const radius = Math.min(containerWidth, containerHeight) / 2 * 0.9;

    // Populate the global aggregateData variable
    aggregateData = [
        { type: "Individual", value: d3.sum(data, d => d.Type === "Individual" ? d.Weight : 0) },
        { type: "Team", value: d3.sum(data, d => d.Type === "Team" ? d.Weight : 0) }
    ];

    const pie = d3.pie()
        .value(d => d.value)
        .sort(null);

    const arcGenerator = d3.arc()
        .innerRadius(radius * 0.6)
        .outerRadius(radius * 0.9);

    // Data join for arcs
    const arcs = g.selectAll(".arc-path") // Use a class for the path to select it directly
        .data(pie(aggregateData), d => d.data.type); // Add key function for data binding

    // Enter selection
    arcs.enter().append("path")
        .attr("class", "arc-path") // Add class for selection
        .attr("fill", d => d.data.type === "Individual" ? individualColor : teamColor)
        .attr("d", arcGenerator) // Set final 'd' attribute immediately
        .each(function(d) { this._current = d; }) // Store initial data for transitions
        .style("opacity", 0) // Start invisible
        .on("click", function(event, d) {
            event.stopPropagation();
            const type = d.data.type;
            if (selectedDonutArcs.has(type)) {
                selectedDonutArcs.delete(type);
            } else {
                selectedDonutArcs.add(type);
            }
            updateDonutColors(); // Call update colors after selection change
        })
        .transition()
        .duration(800)
        .delay((d, i) => i * 100 + 200)
        .style("opacity", 1)
        .ease(d3.easeBounceOut);

    // Update selection
    arcs.transition()
        .duration(800)
        .delay((d, i) => i * 100 + 200)
        .attrTween("d", function(d) {
            const i = d3.interpolate(this._current, d);
            this._current = i(0);
            return function(t) {
                return arcGenerator(i(t));
            };
        })
        .style("opacity", 1)
        .ease(d3.easeBounceOut);

    // Exit selection
    arcs.exit().remove();

    // Initial rendering of percentage and description text elements
    g.append("text")
        .attr("class", "donut-percentage-text")
        .attr("y", -10)
        .style("opacity", 0); // Start invisible for animation

    g.append("text")
        .attr("class", "donut-description-text")
        .attr("y", 30)
        .style("opacity", 0); // Start invisible for animation

    // Animate text visibility
    g.selectAll(".donut-percentage-text, .donut-description-text")
        .transition()
        .duration(500)
        .delay(500)
        .style("opacity", 1);

    updateDonutColors(); // Apply initial colors and text based on selection
}

function updateDonutColors() {
    d3.select("#my-d3-chart #donut-chart-container").selectAll(".arc-path") // Select the path directly
        .attr("fill", function(d) { // Directly set fill without transition for immediate change
            const type = d.data.type;
            let color;
            if (selectedDonutArcs.has(type)) {
                color = ORANGE;
            } else if (selectedDonutArcs.size > 0) {
                color = GRAY;
            } else {
                color = type === "Individual" ? individualColor : teamColor;
            }
            return color;
        });

    // --- Logic for updating center text and color ---
    let totalSelectedWeight = 0;
    let descriptionText = "Individual weight<tspan x='0' dy='1.2em'>in course</tspan>";
    let textColor = individualColor; // Default color for text

    if (selectedDonutArcs.size > 0) {
        // Calculate total selected weight
        selectedDonutArcs.forEach(type => {
            const dataPoint = aggregateData.find(d => d.type === type);
            if (dataPoint) {
                totalSelectedWeight += dataPoint.value;
            }
        });
        descriptionText = "Selected weight<tspan x='0' dy='1.2em'>in course</tspan>";
        textColor = ORANGE; // Change text color to highlight color when selected
    } else {
        // If nothing is selected, revert to showing individual weight
        const individualData = aggregateData.find(d => d.type === "Individual");
        if (individualData) {
            totalSelectedWeight = individualData.value;
        }
        descriptionText = "Individual weight<tspan x='0' dy='1.2em'>in course</tspan>";
        textColor = individualColor; // Revert to individual color
    }

    const percentage = (totalSelectedWeight * 100).toFixed(0);

    d3.select("#my-d3-chart #donut-chart-container").select(".donut-percentage-text")
        .text(`${percentage}%`)
        .attr("fill", textColor); // Update text color

    d3.select("#my-d3-chart #donut-chart-container").select(".donut-description-text")
        .html(descriptionText)
        .attr("fill", textColor); // Update text color
    // --- End new logic ---
}

// Stacked Bar Chart
function drawStackedBarChart() {
    const container = d3.select("#my-d3-chart #stacked-bar-chart-container");
    container.html("");

    // Data aggregation
    const componentData = d3.rollup(data,
        v => {
            const individualSum = d3.sum(v, d => d.Type === "Individual" ? d.Weight : 0);
            const teamSum = d3.sum(v, d => d.Type === "Team" ? d.Weight : 0);
            return { Individual: individualSum, Team: teamSum, Total: individualSum + teamSum };
        },
        d => d.Component
    );

    const stackedData = Array.from(componentData, ([key, value]) => ({
        Component: key,
        Individual: value.Individual,
        Team: value.Team,
        Total: value.Total
    }));

    // Sort data by total weight
    stackedData.sort((a, b) => b.Total - a.Total);

    // Dynamic left margin based on the longest label
    const longestLabel = d3.max(stackedData, d => d.Component.length);
    // Estimate pixel width: font-size 0.8rem (12.8px) with ~7px per character
    const dynamicLeftMargin = Math.max(80, longestLabel * 7.5 + 20); // Min of 80px, plus a buffer

    const stackedMargin = { top: 20, right: 20, bottom: 20, left: dynamicLeftMargin };
    const chartWidth = containerWidth - stackedMargin.left - stackedMargin.right;
    const chartHeight = containerHeight - stackedMargin.top - stackedMargin.bottom;

    const svg = container.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    // Simple translation using the calculated left margin
    const g = svg.append("g")
        .attr("transform", `translate(${stackedMargin.left}, ${stackedMargin.top})`);

    // Scales
    const y = d3.scaleBand()
        .domain(stackedData.map(d => d.Component))
        .range([0, chartHeight])
        .padding(0.2);

    // Calculate the maximum total weight from the stacked data to set the x-axis domain
    const maxTotalWeight = d3.max(stackedData, d => d.Total);

    const x = d3.scaleLinear()
        .domain([0, maxTotalWeight || 0.2]) // Use maxTotalWeight to make bars fill the space
        .range([0, chartWidth]);

    const stack = d3.stack().keys(["Individual", "Team"]);
    const series = stack(stackedData);

    // The 'groups' selection now only creates the G elements, without a default fill
    const groups = g.selectAll(".bar-group")
        .data(series)
        .join(
            enter => enter.append("g")
                .attr("class", "bar-group"),
            update => update,
            exit => exit.remove()
        );

    // Rectangles (bars)
    const rects = groups.selectAll("rect")
        .data(d => d.map(segment => ({ ...segment, seriesKey: d.key })),
              d => d.data.Component + "-" + d.seriesKey);

    // Enter selection
    rects.enter().append("rect")
        .attr("class", "bar")
        .attr("y", d => y(d.data.Component))
        .attr("x", d => x(d[0]))
        .attr("height", y.bandwidth())
        .attr("width", d => x(d[1]) - x(d[0]))
        .style("opacity", 0)
        .on("click", function(event, d) {
            event.stopPropagation();
            const id = d.data.Component + '-' + d.seriesKey;
            if (selectedStackedBars.has(id)) {
                selectedStackedBars.delete(id);
            } else {
                selectedStackedBars.add(id);
            }
            updateStackedColors();
        })
        .transition()
        .duration(800)
        .delay((d, i) => i * 100 + 200)
        .style("opacity", 1)
        .ease(d3.easeBounceOut);

    // Update selection
    rects.transition()
        .duration(800)
        .delay((d, i) => i * 100 + 200)
        .attr("y", d => y(d.data.Component))
        .attr("x", d => x(d[0]))
        .attr("height", y.bandwidth())
        .attr("width", d => x(d[1]) - x(d[0]))
        .style("opacity", 1)
        .ease(d3.easeBounceOut);

    // Exit selection
    rects.exit().transition().duration(500).attr("width", 0).style("opacity", 0).remove();

    // Labels for segments within stacked bars
    const segmentLabels = groups.selectAll(".bar-label")
        .data(d => d.map(segment => ({ segment: segment, seriesKey: d.key })), d => d.segment.data.Component + "-" + d.seriesKey);

    // Enter selection
    segmentLabels.enter().append("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.segment[0]) + (x(d.segment[1]) - x(d.segment[0])) / 2)
        .attr("y", d => y(d.segment.data.Component) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("fill", "white")
        .style("font-size", "0.7rem")
        .attr("text-anchor", "middle")
        .style("opacity", 0)
        .text(d => {
            const value = d.segment.data[d.seriesKey];
            return value > 0.01 ? `${(value * 100).toFixed(0)}%` : "";
        })
        .transition()
        .duration(500)
        .delay((d, i) => i * 100 + 500)
        .style("opacity", 1);

    // Update selection
    segmentLabels.transition()
        .duration(500)
        .delay((d, i) => i * 100 + 500)
        .attr("x", d => x(d.segment[0]) + (x(d.segment[1]) - x(d.segment[0])) / 2)
        .attr("y", d => y(d.segment.data.Component) + y.bandwidth() / 2)
        .text(d => {
            const value = d.segment.data[d.seriesKey];
            return value > 0.01 ? `${(value * 100).toFixed(0)}%` : "";
        })
        .style("opacity", 1);

    // Exit selection
    segmentLabels.exit().transition().duration(500).style("opacity", 0).remove();

    // Component labels
    const componentLabels = g.selectAll(".component-label")
        .data(stackedData, d => d.Component);

    // Enter selection
    componentLabels.enter().append("text")
        .attr("class", "component-label")
        .attr("x", -10)
        .attr("y", d => y(d.Component) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .style("font-size", "0.8rem")
        .style("opacity", 0)
        .text(d => d.Component)
        .transition()
        .duration(500)
        .delay((d, i) => i * 100 + 500)
        .style("opacity", 1);

    // Update selection
    componentLabels.transition()
        .duration(500)
        .delay((d, i) => i * 100 + 500)
        .attr("x", -10)
        .attr("y", d => y(d.Component) + y.bandwidth() / 2)
        .text(d => d.Component)
        .style("opacity", 1);

    // Exit selection
    componentLabels.exit().transition().duration(500).style("opacity", 0).remove();

    // Call updateStackedColors immediately after rects are set up
    updateStackedColors();
}

function updateStackedColors() {
    d3.select("#my-d3-chart #stacked-bar-chart-container").selectAll(".bar-group rect")
        .attr("fill", function(d) {
            const seriesKey = d.seriesKey; // Directly access seriesKey from the bound data
            const id = d.data.Component + '-' + seriesKey; // Use seriesKey for ID
            let color;
            const trimmedSeriesKey = String(seriesKey).trim(); // Ensure it's a string and trim whitespace

            if (selectedStackedBars.has(id)) {
                color = ORANGE;
            } else if (selectedStackedBars.size > 0) {
                color = GRAY;
            } else {
                // Original color logic
                if (trimmedSeriesKey === "Individual") {
                    color = individualColor;
                } else if (trimmedSeriesKey === "Team") {
                    color = teamColor;
                } else {
                    color = "red"; // Fallback to red if something is still unexpected
                }
            }
            return color;
        });
}


// Helper function to get the base deliverable name
function getBaseDeliverableName(deliverable) {
    if (deliverable.endsWith(' (Ind)')) {
        return deliverable.replace(' (Ind)', '');
    }
    if (deliverable.endsWith(' (Team)')) {
        return deliverable.replace(' (Team)', '');
    }
    return deliverable; // Return as is if no (Ind) or (Team) suffix
}

function drawHorizontalBarChart() {
    const container = d3.select("#my-d3-chart #horizontal-bar-chart-container");
    container.html(""); // Clear previous content

    // Update chart dimensions to get the most accurate containerWidth
    updateChartDimensions();

    horizontalBarSvg = container.append("svg")
        .attr("width", containerWidth)
        .attr("height", 0); // Initial height, will be updated by updateHorizontalBarChart

    horizontalBarG = horizontalBarSvg.append("g")
        .attr("transform", `translate(${horizontalMargin.left}, ${horizontalMargin.top})`);

    // Attach event listeners to the HTML sort dropdowns
    const primarySortSelect = myD3Chart.querySelector('#primarySortSelect');
    const secondarySortSelect = myD3Chart.querySelector('#secondarySortSelect');
    const stackedToggle = myD3Chart.querySelector('#stackedToggle'); // Get the new toggle

    if (primarySortSelect) {
        primarySortSelect.value = currentPrimarySort; // Set initial value
        primarySortSelect.onchange = (event) => {
            currentPrimarySort = event.target.value;
            // Determine if stacking is generally possible in the dataset
            const hasIndividualTypeOverall = data.some(d => d.Type === "Individual");
            const hasTeamTypeOverall = data.some(d => d.Type === "Team");
            const canEverStack = hasIndividualTypeOverall && hasTeamTypeOverall;

            // If sorting by Type, disable and uncheck stacked toggle
            if (currentPrimarySort === 'Type' || !canEverStack) {
                isStackedHorizontal = false;
                stackedToggle.checked = false;
                myD3Chart.querySelector('#stackedToggleContainer').classList.add('hidden');
            } else {
                myD3Chart.querySelector('#stackedToggleContainer').classList.remove('hidden');
            }
            updateHorizontalBarChart();
        };
    }
    if (secondarySortSelect) {
        secondarySortSelect.value = currentSecondarySort; // Set initial value
        secondarySortSelect.onchange = (event) => {
            currentSecondarySort = event.target.value;
            updateHorizontalBarChart();
        };
    }
    if (stackedToggle) {
        stackedToggle.checked = isStackedHorizontal; // Set initial state
        stackedToggle.onchange = (event) => {
            isStackedHorizontal = event.target.checked;
            updateHorizontalBarChart();
        };
    }

    // Initial check for stacked toggle visibility on chart load
    const hasIndividualTypeOverall = data.some(d => d.Type === "Individual");
    const hasTeamTypeOverall = data.some(d => d.Type === "Team");
    const canEverStack = hasIndividualTypeOverall && hasTeamTypeOverall;

    if (currentPrimarySort === 'Type' || !canEverStack) {
        myD3Chart.querySelector('#stackedToggleContainer').classList.add('hidden');
        isStackedHorizontal = false;
        stackedToggle.checked = false;
    } else {
        myD3Chart.querySelector('#stackedToggleContainer').classList.remove('hidden');
    }

    // Calculate and apply margin-left for the toggle container to align with "Deliverables" text
    const stackedToggleContainer = myD3Chart.querySelector('#stackedToggleContainer');
    if (stackedToggleContainer) {
        // The 'Deliverable' labels are positioned at x = -10 relative to horizontalBarG.
        // horizontalBarG is translated by horizontalMargin.left.
        // So, the absolute left position of the 'D' in 'Deliverables' is horizontalMargin.left - 10.
        const desiredLeft = horizontalMargin.left - 317;
        stackedToggleContainer.style.marginLeft = `${desiredLeft}px`;
    }

    updateHorizontalBarChart(); // Initial render of the chart content
}

function updateHorizontalBarChart() {
    // Check if we need a full redraw
    const needsRedraw = wasStackedBeforeUpdate !== isStackedHorizontal;
    if (needsRedraw) {
        horizontalBarG.selectAll("*").remove(); // Clear all elements
    }
    wasStackedBeforeUpdate = isStackedHorizontal; // Update state for next call

    let processedData = [];
    let maxWeightForScale = 0;

    if (isStackedHorizontal && currentPrimarySort !== 'Type') {
        // Stacked logic
        const groupedByBaseDeliverable = d3.group(data, d => getBaseDeliverableName(d.Deliverable));

        groupedByBaseDeliverable.forEach((deliverables, baseDeliverableName) => {
            const individualWeight = d3.sum(deliverables, d => d.Type === "Individual" ? d.Weight : 0);
            const teamWeight = d3.sum(deliverables, d => d.Type === "Team" ? d.Weight : 0);
            const totalWeight = individualWeight + teamWeight;

            if (totalWeight > 0) {
                processedData.push({
                    Deliverable: baseDeliverableName,
                    Individual: individualWeight,
                    Team: teamWeight,
                    TotalWeight: totalWeight,
                    Component: deliverables[0].Component,
                    Type: 'Stacked'
                });
            }
        });

        // Sort stacked data
        if (currentPrimarySort === 'All') {
            if (currentSecondarySort === 'Weight') {
                processedData.sort((a, b) => b.TotalWeight - a.TotalWeight);
            } else if (currentSecondarySort === 'Sequence') {
                processedData.sort((a, b) => {
                    const seqA = data.find(d => getBaseDeliverableName(d.Deliverable) === a.Deliverable)?.Sequence || 0;
                    const seqB = data.find(d => getBaseDeliverableName(d.Deliverable) === b.Deliverable)?.Sequence || 0;
                    return seqA - seqB;
                });
            }
        } else { // Sort by Component
            const primaryKey = currentPrimarySort;
            const secondaryKey = currentSecondarySort;

            processedData.sort((a, b) => {
                if (a[primaryKey] < b[primaryKey]) return -1;
                if (a[primaryKey] > b[primaryKey]) return 1;

                if (secondaryKey === 'Weight') {
                    return b.TotalWeight - a.TotalWeight;
                } else if (secondaryKey === 'Sequence') {
                    const seqA = data.find(d => getBaseDeliverableName(d.Deliverable) === a.Deliverable)?.Sequence || 0;
                    const seqB = data.find(d => getBaseDeliverableName(d.Deliverable) === b.Deliverable)?.Sequence || 0;
                    return seqA - seqB;
                }
                return 0;
            });
        }
        maxWeightForScale = d3.max(processedData, d => d.TotalWeight) || 0.2;
        if (maxWeightForScale === 0) maxWeightForScale = 0.2;
    } else {
        // Non-stacked logic
        processedData = [...data];
        // Apply sorting
        if (currentPrimarySort === 'All') {
            if (currentSecondarySort === 'Weight') {
                processedData.sort((a, b) => b.Weight - a.Weight);
            } else if (currentSecondarySort === 'Sequence') {
                processedData.sort((a, b) => a.Sequence - b.Sequence);
            }
        } else { // Sort by Component or Type
            const primaryKey = currentPrimarySort;
            const secondaryKey = currentSecondarySort;

            processedData.sort((a, b) => {
                if (a[primaryKey] < b[primaryKey]) return -1;
                if (a[primaryKey] > b[primaryKey]) return 1;

                if (secondaryKey === 'Weight') {
                    return b.Weight - a.Weight;
                } else if (secondaryKey === 'Sequence') {
                    return a.Sequence - b.Sequence;
                }
                return 0;
            });
        }
        maxWeightForScale = d3.max(processedData, d => d.Weight) || 0.2;
        if (maxWeightForScale === 0) maxWeightForScale = 0.2;
    }

    updateChartDimensions();
    const chartWidth = Math.max(0, containerWidth - horizontalMargin.left - horizontalMargin.right);
    const barHeight = 20;
    const barPadding = 5;
    const categoryHeadingHeight = 30;
    const categorySpacing = 15;

    let currentY = 0;
    const yPositions = {};
    let previousCategory = null;

    processedData.forEach((d, i) => {
        const currentCategory = d[currentPrimarySort];
        if ((currentPrimarySort === 'Type' || currentPrimarySort === 'Component') && currentCategory !== previousCategory) {
            if (previousCategory !== null) {
                currentY += categorySpacing;
            }
            yPositions[`heading-${currentCategory}`] = currentY + categoryHeadingHeight / 2; // Store center
            currentY += categoryHeadingHeight;
        }
        yPositions[d.Deliverable] = currentY + barHeight / 2; // Store center
        currentY += barHeight + barPadding;
        previousCategory = currentCategory;
    });

    const totalSvgHeight = currentY + horizontalMargin.top + horizontalMargin.bottom;
    horizontalBarSvg.transition()
        .duration(700)
        .ease(d3.easeCubicInOut)
        .attr("height", totalSvgHeight);

    const totalRequiredCardHeight = totalSvgHeight + (1.5 * 16 * 2) + 40 + 40;
    flipCard.style.height = `${Math.max(parseFloat(defaultCardHeight), totalRequiredCardHeight)}px`;
    flipCardInner.style.height = flipCard.style.height;

    const x = d3.scaleLinear()
        .domain([0, maxWeightForScale])
        .range([0, chartWidth]);

    // D3.js Update Pattern
    // Handle category headings
    const categories = Array.from(new Set(processedData.map(d => d[currentPrimarySort])));
    horizontalBarG.selectAll(".category-heading")
        .data((currentPrimarySort === 'Type' || currentPrimarySort === 'Component') ? categories : [], d => d)
        .join(
            enter => enter.append("text")
                .attr("class", "category-heading")
                .attr("x", -horizontalMargin.left + 10)
                .attr("y", d => yPositions[`heading-${d}`])
                .attr("text-anchor", "start")
                .text(d => d)
                .style("opacity", 0)
                .transition()
                .duration(700)
                .ease(d3.easeCubicInOut)
                .style("opacity", 1),
            update => update.transition()
                .duration(700)
                .ease(d3.easeCubicInOut)
                .attr("y", d => yPositions[`heading-${d}`])
                .style("opacity", 1),
            exit => exit.transition()
                .duration(500)
                .style("opacity", 0)
                .remove()
        );
    // Handle bars and labels
    if (isStackedHorizontal && currentPrimarySort !== 'Type') {
        const stack = d3.stack().keys(["Individual", "Team"]);
        const series = stack(processedData);

        const barGroups = horizontalBarG.selectAll(".stacked-bar-group")
            .data(processedData, d => d.Deliverable)
            .join(
                enter => enter.append("g").attr("class", "stacked-bar-group"),
                update => update,
                exit => exit.remove()
            );

        const segments = barGroups.selectAll("rect")
            .data(d => {
                // For each deliverable (d), find its corresponding stacked segments from the 'series'
                // We need to iterate through the series to get the segments for this specific deliverable
                const deliverableSegments = [];
                series.forEach(s => {
                    const segment = s.find(item => item.data.Deliverable === d.Deliverable);
                    if (segment) {
                        deliverableSegments.push({
                            ...segment,
                            seriesKey: s.key // Correctly assign the series key
                        });
                    }
                });
                return deliverableSegments;
            }, d => d.data.Deliverable + '-' + d.seriesKey);

        segments.join(
            enter => enter.append("rect")
                .attr("class", "bar")
                .attr("y", d => yPositions[d.data.Deliverable] - barHeight / 2)
                .attr("height", barHeight)
                .attr("x", d => x(d[0])) // Correct x position for stacked bars
                .attr("width", 0) // Start with zero width
                .attr("fill", d => d.seriesKey === "Individual" ? individualColor : teamColor)
                .style("opacity", 0)
                .on("click", function(event, d) {
                    event.stopPropagation();
                    const id = d.data.Deliverable + '-' + d.seriesKey;
                    if (selectedHorizontalBars.has(id)) {
                        selectedHorizontalBars.delete(id);
                    } else {
                        selectedHorizontalBars.add(id);
                    }
                    updateHorizontalColors();
                })
                .transition()
                .duration(1000)
                .ease(d3.easeCubicInOut)
                .attr("width", d => x(d[1]) - x(d[0])) // Animate to final width
                .style("opacity", 1),
            update => update.transition()
                .duration(1000)
                .ease(d3.easeCubicInOut)
                .attr("y", d => yPositions[d.data.Deliverable] - barHeight / 2)
                .attr("x", d => x(d[0])) // Correct x position for stacked bars
                .attr("width", d => x(d[1]) - x(d[0]))
                .attr("fill", d => d.seriesKey === "Individual" ? individualColor : teamColor)
                .style("opacity", 1),
            exit => exit.transition()
                .duration(500)
                .style("opacity", 0)
                .attr("width", 0)
                .remove()
        );

        // Labels for stacked segments
        horizontalBarG.selectAll(".segment-percentage-label")
            .data(processedData.flatMap(d => {
                // For each deliverable (d), find its corresponding stacked segments from the 'series'
                const deliverableSegments = [];
                series.forEach(s => {
                    const segment = s.find(item => item.data.Deliverable === d.Deliverable);
                    if (segment) {
                        deliverableSegments.push({
                            ...segment,
                            seriesKey: s.key // Correctly assign the series key
                        });
                    }
                });
                return deliverableSegments;
            }), d => d.data.Deliverable + '-' + d.seriesKey + '-percentage')
            .join(
                enter => enter.append("text")
                    .attr("class", "segment-percentage-label")
                    .attr("y", d => yPositions[d.data.Deliverable])
                    .attr("x", d => x(d[0]) + (x(d[1]) - x(d[0])) / 2)
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "middle")
                    .attr("fill", "white")
                    .style("font-size", "0.7rem")
                    .text(d => {
                        // Use the segment's actual value (d[1] - d[0]) for percentage calculation
                        const value = d[1] - d[0];
                        if (value === 0) return "";
                        const percentage = (value * 100).toFixed(0);
                        const textContent = `${percentage}%`;
                        const estimatedTextWidth = textContent.length * 7;
                        const segmentWidth = x(d[1]) - x(d[0]);
                        return segmentWidth > estimatedTextWidth ? textContent : "";
                    })
                    .style("opacity", 0)
                    .transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1),
                update => update.transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .attr("y", d => yPositions[d.data.Deliverable])
                    .attr("x", d => x(d[0]) + (x(d[1]) - x(d[0])) / 2)
                    .text(d => {
                        const value = d[1] - d[0];
                        if (value === 0) return "";
                        const percentage = (value * 100).toFixed(0);
                        const textContent = `${percentage}%`;
                        const estimatedTextWidth = textContent.length * 7;
                        const segmentWidth = x(d[1]) - x(d[0]);
                        return segmentWidth > estimatedTextWidth ? textContent : "";
                    })
                    .style("opacity", 1),
                exit => exit.transition()
                    .duration(500)
                    .style("opacity", 0)
                    .remove()
            );


        // Total percentage labels
        horizontalBarG.selectAll(".total-percentage-label")
            .data(processedData, d => d.Deliverable)
            .join(
                enter => enter.append("text")
                    .attr("class", "percentage-label total-percentage-label")
                    .attr("y", d => yPositions[d.Deliverable])
                    .attr("x", d => x(d.TotalWeight) + 5)
                    .attr("dy", "0.35em")
                    .text(d => `${(d.TotalWeight * 100).toFixed(0)}%`)
                    .style("opacity", 0)
                    .transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1),
                update => update.transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .attr("y", d => yPositions[d.Deliverable])
                    .attr("x", d => x(d.TotalWeight) + 5)
                    .text(d => `${(d.TotalWeight * 100).toFixed(0)}%`)
                    .style("opacity", 1),
                exit => exit.transition()
                    .duration(500)
                    .style("opacity", 0)
                    .remove()
            );

        // Deliverable labels
        horizontalBarG.selectAll(".deliverable-label-stacked")
            .data(processedData, d => d.Deliverable)
            .join(
                enter => enter.append("text")
                    .attr("class", "bar-label deliverable-label-stacked")
                    .attr("x", -10)
                    .attr("y", d => yPositions[d.Deliverable])
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "end")
                    .text(d => d.Deliverable)
                    .style("opacity", 0)
                    .transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1),
                update => update.transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .attr("y", d => yPositions[d.Deliverable])
                    .text(d => d.Deliverable)
                    .style("opacity", 1),
                exit => exit.transition()
                    .duration(500)
                    .style("opacity", 0)
                    .remove()
            );
    } else {
        horizontalBarG.selectAll(".bar")
            .data(processedData, d => d.Deliverable)
            .join(
                enter => enter.append("rect")
                    .attr("class", "bar")
                    .attr("y", d => yPositions[d.Deliverable] - barHeight / 2)
                    .attr("height", barHeight)
                    .attr("fill", d => d.Type === "Individual" ? individualColor : teamColor)
                    .attr("x", 0)
                    .attr("width", 0)
                    .style("opacity", 0)
                    .on("click", function(event, d) {
                        event.stopPropagation();
                        const id = d.Deliverable;
                        if (selectedHorizontalBars.has(id)) {
                            selectedHorizontalBars.delete(id);
                        } else {
                            selectedHorizontalBars.add(id);
                        }
                        updateHorizontalColors();
                    })
                    .transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .attr("width", d => x(d.Weight))
                    .style("opacity", 1),
                update => update.transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .attr("y", d => yPositions[d.Deliverable] - barHeight / 2)
                    .attr("width", d => x(d.Weight))
                    .style("opacity", 1),
                exit => exit.transition()
                    .duration(500)
                    .attr("width", 0)
                    .style("opacity", 0)
                    .remove()
            );

        horizontalBarG.selectAll(".bar-label")
            .data(processedData, d => d.Deliverable)
            .join(
                enter => enter.append("text")
                    .attr("class", "bar-label")
                    .attr("x", -10)
                    .attr("y", d => yPositions[d.Deliverable])
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "end")
                    .text(d => d.Deliverable)
                    .style("opacity", 0)
                    .transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1),
                update => update.transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .attr("y", d => yPositions[d.Deliverable])
                    .text(d => d.Deliverable)
                    .style("opacity", 1),
                exit => exit.transition()
                    .duration(500)
                    .style("opacity", 0)
                    .remove()
            );

        horizontalBarG.selectAll(".percentage-label")
            .data(processedData, d => d.Deliverable)
            .join(
                enter => enter.append("text")
                    .attr("class", "percentage-label")
                    .attr("x", d => x(d.Weight) + 5)
                    .attr("y", d => yPositions[d.Deliverable])
                    .attr("dy", "0.35em")
                    .text(d => `${(d.Weight * 100).toFixed(0)}%`)
                    .style("opacity", 0)
                    .transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .style("opacity", 1),
                update => update.transition()
                    .duration(1000)
                    .ease(d3.easeCubicInOut)
                    .attr("x", d => x(d.Weight) + 5)
                    .attr("y", d => yPositions[d.Deliverable])
                    .text(d => `${(d.Weight * 100).toFixed(0)}%`)
                    .style("opacity", 1),
                exit => exit.transition()
                    .duration(500)
                    .style("opacity", 0)
                    .remove()
            );
    }

    updateHorizontalColors();
}

function updateHorizontalColors() {
    d3.select("#my-d3-chart #horizontal-bar-chart-container").selectAll(".bar")
        .attr("fill", function(d) {
            let id;
            let barType;

            if (isStackedHorizontal && currentPrimarySort !== 'Type') {
                id = d.data.Deliverable + '-' + d.seriesKey;
                barType = d.seriesKey; // This will be "Individual" or "Team"
            } else {
                id = d.Deliverable;
                barType = d.Type; // This will be "Individual" or "Team"
            }

            let color;
            if (selectedHorizontalBars.has(id)) {
                color = ORANGE;
            } else if (selectedHorizontalBars.size > 0) {
                color = GRAY;
            } else {
                // Base colors for non-selected bars
                if (barType === "Individual") {
                    color = individualColor;
                } else if (barType === "Team") {
                    color = teamColor;
                } else {
                    color = "purple"; // Fallback for unexpected types
                }
            }
            return color;
        });
}

// Global click listener to reset colors when clicking outside bars/icons
myD3Chart.addEventListener('click', function(event) {
    // Check if the click target is a chart element, flip icon, or arrow icon
    const isChartElement = event.target.closest('.bar, .arc-path, .flip-icon, .arrow-icon, .sort-button, #stackedToggleContainer');

    if (!isChartElement) {
        // Only reset if there are active selections in any chart
        if (selectedDonutArcs.size > 0 || selectedStackedBars.size > 0 || selectedHorizontalBars.size > 0) {
            selectedDonutArcs.clear();
            selectedStackedBars.clear();
            selectedHorizontalBars.clear();

            // Re-render colors for the currently visible chart
            if (currentChartIndex === 0) {
                updateDonutColors();
            } else if (currentChartIndex === 1) {
                updateStackedColors();
            } else if (currentChartIndex === 2) {
                updateHorizontalColors();
            }
        }
    }
});

// Function to load and process the CSV data
function loadAndProcessData() {
    // Fetch data from the CSV file
    d3.csv("GradeWeights.csv").then(rawData => {
        // Parse data: convert weight strings to numbers
        data = rawData.map(d => ({
            ...d,
            Weight: parseFloat(d.Weight) / 100, // Convert "15%" to 0.15
            Sequence: parseInt(d.Sequence, 10) // Ensure Sequence is a number for proper sorting
        }));

        // Check if 'Component' column exists for stacked bar chart
        hasComponentData = data.some(d => d.Component !== undefined && d.Component !== null);

        // Initial render on window load, now that data is available
        renderTable();
        adjustCardHeightForTable();
        updateChartDimensions();
        updateArrowVisibility();

        // Re-render charts on window resize to ensure responsiveness
        window.addEventListener('resize', () => {
            if (flipCard.classList.contains('flipped')) {
                updateChartDimensions();
                renderCharts();
                updateArrowVisibility();
            } else {
                renderTable();
                adjustCardHeightForTable();
            }
        });
    }).catch(error => {
        console.error("Error loading the CSV file:", error);
        // Optionally display an error message to the user
        const tableContainer = d3.select("#my-d3-chart #table-container");
        tableContainer.html("<p class='text-red-500'>Error loading data. Please ensure 'GradeWeights.csv' is available.</p>");
    });
}

// Call the new function to start the process when the window loads
window.onload = loadAndProcessData;