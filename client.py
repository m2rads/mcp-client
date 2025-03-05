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







