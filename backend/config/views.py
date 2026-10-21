from django.http import JsonResponse


def health(_request):
    """Lightweight liveness check for load balancers and frontend cold-start wake."""
    return JsonResponse({'status': 'ok'})
