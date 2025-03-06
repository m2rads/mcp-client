import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { error } from "console";
import { z } from "zod";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";


// server instance
const server = new McpServer({
    name: "weather",
    version: "1.0.0"
});


interface PointsResponse { 
    properties: { 
        forecast?: string; 
    }
}

interface ForecastPeriod { 
    name?: string; 
    temperature?: number; 
    temperatureUnit?: string; 
    windSpeed?: string; 
    windDirection?: string; 
    shortForecast?: string;
}

interface AlertFeature { 
    properties: { 
        event?: string;
        areaDesc?: string;
        severity?: string;
        status?: string;
        headline?: string;
    };
}

interface AlertsResponse {
    features: AlertFeature[];
}

interface ForecastResponse { 
    properties: { 
        periods?: ForecastPeriod[]; 
    }
}

async function makeNWSRequest<T>(url: string): Promise<T | null> { 
    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
    };

    try { 
        const response = await fetch(url, { headers }); 
        if (!response.ok) { 
            throw new Error(`HTTP error! status: ${response.status}`); 
        }
        return (await response.json()) as T; 
    } catch (error) { 
        console.error("Error fetching data from NWS:", error); 
        return null; 
    }
}

// format alert data 
function formatAlert(feature: AlertFeature): string {
    const props = feature.properties;
    return [
        `Event: ${props.event || "Unknown"}`,
        `Area: ${props.areaDesc || "Unknown"}`,
        `Severity: ${props.severity || "Unknown"}`,
        `Status: ${props.status || "Unknown"}`,
        `Headline: ${props.headline || "Unknown"}`,
        "---"
    ].join("\n");
}


// Tool Execution

// Register weather tool 

server.tool(
    "get-alerts",
    "Get weather alerts for a state",
    {
      state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
    },
    async ({ state }) => {
      const stateCode = state.toUpperCase();
      const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
      const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);
  
      if (!alertsData) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve alerts data",
            },
          ],
        };
      }
  
      const features = alertsData.features || [];
      if (features.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No active alerts for ${stateCode}`,
            },
          ],
        };
      }
  
      // format alerts
      const formattedAlerts = features.map(formatAlert);
      const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;
  
      return {
        content: [
          {
            type: "text",
            text: alertsText,
          },
        ],
      };
    },
  );
  

  server.tool(
    "get-forecast",
    "Get weather forecast for a specific location",
    {
        latitude: z.number().describe("Latitude of the location"), // the params that the tool expects
        longitude: z.number().describe("Longitude of the location"),
    },

    async ({ latitude, longitude }) => { 
        // Get grid point dat 
        const pointsUrl = `${NWS_API_BASE}/points/${latitude},${longitude}`;
        const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

        if (!pointsData) { 
            return { 
                content: [
                    { 
                        type: "text",
                        text: `Failed to retrieve grid point data for coordinates: ${latitude},${longitude}`
                    }
                ]
            }
        }

        const forecastUrl = pointsData.properties?.forecast;
        if (!forecastUrl) { 
            return { 
                content: [
                    { 
                        type: "text",
                        text: `Failed to get forecast URL from grid point data`
                    }
                ]
            }
        }

        // Get forecast data 
        const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
        if (!forecastData) { 
            return { 
                content: [
                    {    
                        type: "text",
                        text: "Failed to retrieve forecast data"
                    }
                ]
            }
        }

        const periods = forecastData.properties?.periods || [];
        if (periods.length === 0) {     
            return { 
                content: [
                    { 
                        type: "text",
                        text: "No forecast periods found"
                    }
                ]
            }
        }

        // Format forcast period
        const formattedForecast = periods.map((period: ForecastPeriod) =>
            [
              `${period.name || "Unknown"}:`,
              `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
              `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
              `${period.shortForecast || "No forecast available"}`,
              "---",
            ].join("\n"),
          );

        const forecastText = `Weather forecast for ${latitude},${longitude}:\n\n${formattedForecast.join("\n")}`;
        
        return {
            content: [
                { 
                    type: "text",
                    text: forecastText
                }
            ]
        }
    }
  )

  async function main() { 
    const transport = new StdioServerTransport(); // what does this do? 
    await server.connect(transport);
    console.log("Weather server is running...");
  }

  main().catch( (error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  }); 