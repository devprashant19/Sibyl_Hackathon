import logging
import time

logger = logging.getLogger(__name__)

def install_db():
    try:
        import psycopg2
        original_connect = psycopg2.connect

        def patched_connect(*args, **kwargs):
            conn = original_connect(*args, **kwargs)
            original_cursor = conn.cursor
            
            def patched_cursor(*c_args, **c_kwargs):
                cursor = original_cursor(*c_args, **c_kwargs)
                original_execute = cursor.execute
                
                def patched_execute(query, vars=None):
                    # Check for SLOW_IO fault
                    # if fault == 'SLOW_IO': time.sleep(delay)
                    return original_execute(query, vars)
                
                cursor.execute = patched_execute
                return cursor
            
            conn.cursor = patched_cursor
            return conn

        psycopg2.connect = patched_connect
        logger.info("[Sibyl] psycopg2 patched.")
    except ImportError:
        pass

    try:
        import asyncpg
        original_connect = asyncpg.connect

        async def patched_connect(*args, **kwargs):
            conn = await original_connect(*args, **kwargs)
            original_execute = conn.execute
            
            async def patched_execute(query, *args, **kwargs):
                # asyncio.sleep(delay) for SLOW_IO
                return await original_execute(query, *args, **kwargs)
                
            conn.execute = patched_execute
            return conn

        asyncpg.connect = patched_connect
        logger.info("[Sibyl] asyncpg patched.")
    except ImportError:
        pass
