import logging

logger = logging.getLogger(__name__)

def install_http():
    try:
        import requests
        original_send = requests.Session.send

        def patched_send(self, request, **kwargs):
            # Evaluate faults here
            # e.g., if fault is TIMEOUT, raise requests.exceptions.Timeout
            return original_send(self, request, **kwargs)

        requests.Session.send = patched_send
        logger.info("[Sibyl] requests patched.")
    except ImportError:
        pass

    try:
        import httpx
        original_async_send = httpx.AsyncClient.send

        async def patched_async_send(self, request, **kwargs):
            return await original_async_send(self, request, **kwargs)

        httpx.AsyncClient.send = patched_async_send
        logger.info("[Sibyl] httpx patched.")
    except ImportError:
        pass
