import asyncio
from typing import Optional
from contextlib import AsyncExitStack


from mcp import ClientSession, StudioServerParameters 
from mcp.client.stdio import stdio_client

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

class MCPClient:
    def __init__(self):
        # Initialize session and client objects 
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.anthropic = Anthropic()
    # methods will go here 


    # server connection management 
    async def connect_to_server(self, server_Script_path: str):
        """ connect to a MCP server

            Args: 
            server_Script_path: Path to the server script (.py or .js)
        """

        is_python = server_Script_path.endswith('.py')
        is_javascript = server_Script_path.endswith('.js')

        if not (is_python or is_javascript):
            raise ValueError("Invalid server script path. Must be a .py or .js file.")

        command = "python" if is_python else "node"
        server_params = StudioServerParameters(
            command=command,
            args=[server_Script_path],
            env=None # figure out what this is
        )

        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        self.stdio, self.write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write))

        await self.session.initialize() 

        # List available tools 
        response = await self.session.list_tools()
        tools = response.tools
        print("\nConnected to server with tools:", [tool.name for tool in tools])

        # Query Processing Logic 

        async def process_query(self, query: str) -> str: 
            """ Process a user query and return a response """
            messages = [ 
                {
                    "role": "user",
                    "content": query
                }
            ]

            response = await self.session.list.tools() 
            available_tools = [{ 
                "name": tool.name,
                "description": tool.description,
                "input_Schema": tool.input_schema 
            } for tool in response.tools]

            # initial Claude API call 
            resposne = self.anthropic.messages.create(
                model="claude-3-5-sonnet-20240620",
                max_tokens=1000,
                messages=messages,
                tools=available_tools
            )

            # Process response and handle tool calls 
            tool_results = []
            final_text = [] 

            assistant_message_content = [] 
            for content in response.content: 
                if content.type == "text": 
                    final_text.append(content.text)
                    assistant_message_content.append(content)
                elif content.type == "tool_use": # the tool that AI calls for
                    tool_name = content.name
                    tool_args = content.input

                    # Execute tool call 
                    result = await self.session.call_tool(tool_name, tool_args)
                    tool_results.append({"call": tool_name, "result": result})
                    final_text.append(f"[Calling tool {tool_name} with args {tool_args}]")

                    assistant_message_content.append(content)
                    messages.append({
                        "role": "assistant",
                        "content": assistant_message_content
                    })
                    messages.append({
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": content.id,
                                "content": result.content
                            }
                        ]
                    })

                    # we need to append all the context
                    #  Get next response from Claude 
                    response = self.anthropic.messages.create(
                        model="claude-3-5-sonnet-20240620",
                        max_tokens=1000,
                        messages=messages,
                        tools=available_tools
                    )
                    
                    final_text.append(response.content[0].text)

            return "".join(final_text)        
        

    # Interactive Chat Interface 

    async def chat_loop(self): 
        """ Run an Interactive Chat Loop """
        print("\nHCP Client Started!")
        print("Type your queries pr 'quit' to exit")

        while True: 
            try: 
                query = input("\nQuery: ").strip() 

                if query.lower() == "quit": 
                    print("Exiting...")
                    break 

                response = await self.process_query(query)
                print("\nResponse:", response)
                
            except Exception as e: 
                print(f"An error occurred: {e}")

    async def cleanup(self): 
        """ Clean up resources """
        await self.exit_stack.aclose()


## Main Entry point
async def main(): 
    if len(sys.argv) != 2: 
        print("Usage: python client.py <server_script_path>")
        sys.exit(1)
    
    client = MCPClient()
    try: 
        await client.connect_to_server(sys.argv[1])
        await client.chat_loop()
    finally: 
        await client.cleanup()

if __name__ == "__main__": 
    import sys
    asyncio.run(main())




