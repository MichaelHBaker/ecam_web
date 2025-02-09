from zoneinfo import available_timezones

def list_all_timezones():
    """Returns a sorted list of all valid timezones from zoneinfo."""
    return sorted(available_timezones())

if __name__ == "__main__":
    print("Available Timezones:\n")
    for tz in list_all_timezones():
        print(tz)