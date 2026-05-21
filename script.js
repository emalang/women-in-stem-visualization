const tooltip = d3.select("#tooltip");

const width = 1100;
const height = 600;

const mapSvg = d3.select("#worldMap").attr("viewBox", `0 0 ${width} ${height}`);
const lineSvg = d3.select("#lineChart").attr("viewBox", `0 0 ${width} ${height}`);
const barSvg = d3.select("#barChart").attr("viewBox", `0 0 ${width} ${height}`);
const scatterSvg = d3.select("#scatterPlot").attr("viewBox", `0 0 ${width} ${height}`);

Promise.all([
  d3.csv("data/graduates.csv"),
  d3.csv("data/indicators.csv"),
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
]).then(([graduates, indicators, world]) => {

  graduates.forEach(d => {
    d.Year = +d.Year;
    d.Value = +d.Value;
  });

  indicators.forEach(d => {
    d.Year = +d.Year;
    d.Value = +d.Value;
  });

  const stemData = graduates.filter(d =>
    d["Indicator Name"] &&
    d["Indicator Name"].includes("STEM") &&
    !isNaN(d.Value)
  );

  const countries = [...new Set(stemData.map(d => d["Country Name"]))].sort();

  const years = [...new Set(stemData.map(d => d.Year))]
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);

  let selectedYear = years.includes(2022) ? 2022 : d3.max(years);

  d3.select("#countryCount").text(countries.length);
  d3.select("#yearRange").text(`${d3.min(years)} — ${d3.max(years)}`);

  const latestData = stemData.filter(d => d.Year === selectedYear);
  const avg = d3.mean(latestData, d => d.Value);
  d3.select("#globalAverage").text(`${avg.toFixed(1)}%`);

  const yearSelect = d3.select("#yearSelect");

  yearSelect
    .selectAll("option")
    .data([...years].reverse())
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d);

  yearSelect.property("value", selectedYear);

  let selectedCountries = ["Croatia", "Germany", "Sweden"];

  const countryDropdownBtn = d3.select("#countryDropdownBtn");
  const countryCheckboxList = d3.select("#countryCheckboxList");
  const resetCountriesBtn = d3.select("#resetCountriesBtn");

  function updateCountryButtonText() {
    if (selectedCountries.length === 0) {
      countryDropdownBtn.text("Select countries");
    } else if (selectedCountries.length <= 3) {
      countryDropdownBtn.text(selectedCountries.join(", "));
    } else {
      countryDropdownBtn.text(`${selectedCountries.length} countries selected`);
    }
  }

  countryDropdownBtn.on("click", () => {
    countryCheckboxList.classed("open", !countryCheckboxList.classed("open"));
  });

  const countryItems = countryCheckboxList
    .selectAll(".checkbox-item")
    .data(countries)
    .enter()
    .append("label")
    .attr("class", "checkbox-item");

  countryItems
    .append("input")
    .attr("type", "checkbox")
    .attr("value", d => d)
    .property("checked", d => selectedCountries.includes(d))
    .on("change", function(event, country) {
      if (this.checked) {
        if (!selectedCountries.includes(country)) selectedCountries.push(country);
      } else {
        selectedCountries = selectedCountries.filter(c => c !== country);
      }

      updateCountryButtonText();
      updateLineChart();
    });

  countryItems.append("span").text(d => d);

  resetCountriesBtn.on("click", () => {
    selectedCountries = [];

    countryCheckboxList
      .selectAll("input")
      .property("checked", false);

    updateCountryButtonText();
    updateLineChart();
  });

  updateCountryButtonText();

  let selectedFieldCountry = "Croatia";
  let fieldSortMode = "default";

  const fieldCountryBtn = d3.select("#fieldCountryBtn");
  const fieldCountryList = d3.select("#fieldCountryList");

  fieldCountryBtn.text(selectedFieldCountry);

  fieldCountryBtn.on("click", () => {
    fieldCountryList.classed("open", !fieldCountryList.classed("open"));
  });

  const fieldItems = fieldCountryList
    .selectAll(".checkbox-item")
    .data(countries)
    .enter()
    .append("label")
    .attr("class", "checkbox-item");

  fieldItems
    .append("input")
    .attr("type", "radio")
    .attr("name", "field-country")
    .attr("value", d => d)
    .property("checked", d => d === selectedFieldCountry)
    .on("change", function(event, country) {
      selectedFieldCountry = country;
      fieldCountryBtn.text(country);
      fieldCountryList.classed("open", false);
      updateBarChart();
    });

  fieldItems.append("span").text(d => d);

  d3.selectAll(".sort-btn").on("click", function() {
    fieldSortMode = this.dataset.sort;

    d3.selectAll(".sort-btn").classed("active", false);
    d3.select(this).classed("active", true);

    updateBarChart();
  });

  const wantedIndicators = [
    "GDP per capita (current US$)",
    "GDP per capita (constant 2015 US$)",
    "Gini index",
    "Inflation, consumer prices (annual % growth)",
    "Children out of school (% of primary school age)",
    "Government expenditure per student, secondary (% of GDP per capita)",
    "GNI per capita, Atlas method (current US$)"
  ];

  let indicatorNames = wantedIndicators.filter(name =>
    indicators.some(d => d["Indicator Name"] === name)
  );

  if (indicatorNames.length === 0) {
    indicatorNames = [...new Set(indicators.map(d => d["Indicator Name"]))]
      .filter(Boolean)
      .slice(0, 20);
  }

  const indicatorSelect = d3.select("#indicatorSelect");

  indicatorSelect
    .selectAll("option")
    .data(indicatorNames)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d);

  indicatorSelect.property("value", indicatorNames[0]);

  const countriesGeo = topojson.feature(world, world.objects.countries);

  const projection = d3
    .geoMercator()
    .fitSize([width, height], countriesGeo);

  const path = d3.geoPath().projection(projection);

  const color = d3.scaleSequential()
    .domain([0, 100])
    .interpolator(d3.interpolatePuBuGn);

  function updateMap(year) {
    const yearData = stemData.filter(d => d.Year === year);

    const valueMap = new Map(
      yearData.map(d => [d["Country Name"], d.Value])
    );

    mapSvg.selectAll("path").remove();

    mapSvg
      .selectAll("path")
      .data(countriesGeo.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("fill", d => {
        const value = valueMap.get(d.properties.name);
        return value && !isNaN(value) ? color(value) : "#1e293b";
      })
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 0.5)
      .on("mousemove", (event, d) => {
        const value = valueMap.get(d.properties.name);

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${d.properties.name}</strong><br>
            Women in STEM:
            ${value && !isNaN(value) ? value.toFixed(1) + "%" : "No data"}
          `)
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 30 + "px");
      })
      .on("mouseleave", () => {
        tooltip.style("opacity", 0);
      });
  }

  function updateLineChart() {
    lineSvg.selectAll("*").remove();

    if (selectedCountries.length === 0) {
      lineSvg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("fill", "#94a3b8")
        .attr("text-anchor", "middle")
        .text("Select one or more countries to display the trend.");

      return;
    }

    const margin = { top: 40, right: 140, bottom: 60, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = lineSvg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain(d3.extent(years))
      .range([0, chartWidth]);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([chartHeight, 0]);

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")));

    g.append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y));

    const line = d3.line()
      .defined(d => !isNaN(d.Value))
      .x(d => x(d.Year))
      .y(d => y(d.Value));

    const colorScale = d3.scaleOrdinal(d3.schemeSet2);

    selectedCountries.forEach(country => {
      const countryData = stemData
        .filter(d => d["Country Name"] === country)
        .sort((a, b) => a.Year - b.Year);

      if (countryData.length === 0) return;

      const pathLine = g.append("path")
        .datum(countryData)
        .attr("fill", "none")
        .attr("stroke", colorScale(country))
        .attr("stroke-width", 3)
        .attr("d", line);

      const totalLength = pathLine.node().getTotalLength();

      pathLine
        .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
        .attr("stroke-dashoffset", totalLength)
        .transition()
        .duration(900)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);

      g.selectAll(`.point-${country.replaceAll(" ", "-")}`)
        .data(countryData)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.Year))
        .attr("cy", d => y(d.Value))
        .attr("r", 0)
        .attr("fill", colorScale(country))
        .transition()
        .delay(600)
        .duration(400)
        .attr("r", 4);

      g.selectAll(`.hover-${country.replaceAll(" ", "-")}`)
        .data(countryData)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.Year))
        .attr("cy", d => y(d.Value))
        .attr("r", 9)
        .attr("fill", "transparent")
        .on("mousemove", (event, d) => {
          tooltip
            .style("opacity", 1)
            .html(`
              <strong>${country}</strong><br>
              ${d.Year}<br>
              ${d.Value.toFixed(1)}%
            `)
            .style("left", event.pageX + 15 + "px")
            .style("top", event.pageY - 30 + "px");
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));

      const lastPoint = countryData[countryData.length - 1];

      g.append("text")
        .attr("x", chartWidth + 10)
        .attr("y", y(lastPoint.Value))
        .attr("fill", colorScale(country))
        .attr("font-size", 13)
        .text(country);
    });
  }

  function makeFieldLabel(name) {
    return name
      .replace("Female share of graduates from Science, Technology, Engineering and Mathematics (STEM) programmes, tertiary (%)", "STEM")
      .replace("Female share of graduates in engineering, manufacturing and construction (%, tertiary)", "Engineering")
      .replace("Female share of graduates in Natural Sciences, Mathematics and Statistics programmes (%, tertiary)", "Natural sciences")
      .replace("Female share of graduates in health and welfare (%, tertiary)", "Health")
      .replace("Female share of graduates in education (%, tertiary)", "Education")
      .replace("Female share of graduates in Arts and Humanities programmes (%, tertiary)", "Arts")
      .replace("Female share of graduates in Social Sciences, Journalism and Information programmes (%, tertiary)", "Social sciences")
      .replace("Female share of graduates in Agriculture, Forestry, Fisheries and Veterinary programmes (%, tertiary)", "Agriculture")
      .replace("Female share of graduates in services (%, tertiary)", "Services")
      .replace("Female share of graduates in ", "")
      .replace(" programmes (%, tertiary)", "")
      .replace(" (%, tertiary)", "")
      .replace(", tertiary (%)", "")
      .slice(0, 28);
  }

  function updateBarChart() {
    barSvg.selectAll("*").remove();

    const fieldRows = graduates.filter(d =>
      d["Country Name"] === selectedFieldCountry &&
      d["Indicator Name"] &&
      d["Indicator Name"].includes("Female share of graduates") &&
      d.Year <= selectedYear &&
      !isNaN(d.Value)
    );

    const latestByField = d3.rollups(
      fieldRows,
      rows => rows.sort((a, b) => b.Year - a.Year)[0],
      d => d["Indicator Name"]
    ).map(([name, row]) => ({
      name,
      field: makeFieldLabel(name),
      value: row.Value,
      year: row.Year
    }));

    let grouped = latestByField.filter(d =>
      !d.name.toLowerCase().includes("unknown")
    );

    if (fieldSortMode === "desc") {
      grouped.sort((a, b) => b.value - a.value);
    } else if (fieldSortMode === "asc") {
      grouped.sort((a, b) => a.value - b.value);
    }

    const margin = { top: 50, right: 90, bottom: 70, left: 190 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = barSvg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const defs = barSvg.append("defs");

    const gradient = defs
      .append("linearGradient")
      .attr("id", "barGradient")
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#7c3aed");

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#22d3ee");

    if (grouped.length === 0) {
      g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight / 2)
        .attr("fill", "#94a3b8")
        .attr("text-anchor", "middle")
        .text("No field data available for this country.");

      return;
    }

    const x = d3.scaleLinear()
      .domain([0, 100])
      .range([0, chartWidth]);

    const y = d3.scaleBand()
      .domain(grouped.map(d => d.field))
      .range([0, chartHeight])
      .padding(0.28);

    g.append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y));

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d + "%"));

    g.selectAll(".bar-bg")
      .data(grouped, d => d.field)
      .join("rect")
      .attr("class", "bar-bg")
      .attr("x", 0)
      .attr("y", d => y(d.field))
      .attr("height", y.bandwidth())
      .attr("width", chartWidth)
      .attr("rx", 10);

    g.selectAll(".bar-value")
      .data(grouped, d => d.field)
      .join(
        enter => enter
          .append("rect")
          .attr("class", "bar-value")
          .attr("x", 0)
          .attr("y", d => y(d.field))
          .attr("height", y.bandwidth())
          .attr("width", 0)
          .attr("rx", 10)
          .call(enter => enter.transition()
            .duration(850)
            .ease(d3.easeCubicOut)
            .attr("width", d => x(d.value))),
        update => update
          .call(update => update.transition()
            .duration(650)
            .attr("y", d => y(d.field))
            .attr("width", d => x(d.value))),
        exit => exit
          .call(exit => exit.transition()
            .duration(300)
            .attr("width", 0)
            .remove())
      )
      .on("mousemove", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${d.field}</strong><br>
            ${d.value.toFixed(1)}%<br>
            Year: ${d.year}
          `)
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 30 + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    g.selectAll(".bar-label")
      .data(grouped, d => d.field)
      .join("text")
      .attr("class", "bar-label")
      .attr("x", d => x(d.value) + 10)
      .attr("y", d => y(d.field) + y.bandwidth() / 2 + 5)
      .text(d => `${d.value.toFixed(1)}%`);

    g.append("text")
      .attr("x", 0)
      .attr("y", -18)
      .attr("fill", "#94a3b8")
      .attr("font-size", 13)
      .text(`${selectedFieldCountry} • latest available values up to ${selectedYear}`);
  }

  function updateScatter() {
    scatterSvg.selectAll("*").remove();

    const selectedIndicator = indicatorSelect.property("value");
    const merged = [];

    countries.forEach(country => {
      const stemRows = stemData
        .filter(d =>
          d["Country Name"] === country &&
          d.Year <= selectedYear &&
          !isNaN(d.Value)
        )
        .sort((a, b) => b.Year - a.Year);

      const indicatorRows = indicators
        .filter(d =>
          d["Country Name"] === country &&
          d["Indicator Name"] === selectedIndicator &&
          d.Year <= selectedYear &&
          !isNaN(d.Value)
        )
        .sort((a, b) => b.Year - a.Year);

      if (stemRows.length > 0 && indicatorRows.length > 0) {
        merged.push({
          country,
          x: indicatorRows[0].Value,
          y: stemRows[0].Value,
          stemYear: stemRows[0].Year,
          indicatorYear: indicatorRows[0].Year
        });
      }
    });

    const margin = { top: 40, right: 40, bottom: 90, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = scatterSvg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    if (merged.length === 0) {
      g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight / 2)
        .attr("fill", "#94a3b8")
        .attr("text-anchor", "middle")
        .text("No data available for this indicator.");

      return;
    }

    const x = d3.scaleLinear()
      .domain(d3.extent(merged, d => d.x))
      .nice()
      .range([0, chartWidth]);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([chartHeight, 0]);

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(6));

    g.append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y));

    g.selectAll("circle")
      .data(merged)
      .join("circle")
      .attr("cx", d => x(d.x))
      .attr("cy", d => y(d.y))
      .attr("r", 0)
      .attr("fill", "#7c3aed")
      .attr("opacity", 0.8)
      .transition()
      .duration(700)
      .attr("r", 7);

    g.selectAll(".scatter-hover")
      .data(merged)
      .join("circle")
      .attr("class", "scatter-hover")
      .attr("cx", d => x(d.x))
      .attr("cy", d => y(d.y))
      .attr("r", 10)
      .attr("fill", "transparent")
      .on("mousemove", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${d.country}</strong><br>
            STEM: ${d.y.toFixed(1)}% (${d.stemYear})<br>
            Indicator: ${d.x.toFixed(2)} (${d.indicatorYear})
          `)
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 30 + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    g.append("text")
      .attr("x", chartWidth / 2)
      .attr("y", chartHeight + 65)
      .attr("fill", "white")
      .attr("text-anchor", "middle")
      .attr("font-size", 13)
      .text(selectedIndicator);

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -chartHeight / 2)
      .attr("y", -55)
      .attr("fill", "white")
      .attr("text-anchor", "middle")
      .attr("font-size", 13)
      .text("Women in STEM (%)");
  }

  updateMap(selectedYear);
  updateLineChart();
  updateBarChart();
  updateScatter();

  yearSelect.on("change", function() {
    selectedYear = +this.value;

    updateMap(selectedYear);
    updateBarChart();
    updateScatter();
  });

  indicatorSelect.on("change", updateScatter);
});

const fadeSections = document.querySelectorAll(".section, .kpi-section");

fadeSections.forEach(section => {
  section.classList.add("fade-section");
});

const fadeObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  {
    threshold: 0.15
  }
);

fadeSections.forEach(section => {
  fadeObserver.observe(section);
});

